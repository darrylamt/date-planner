import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Push from the server, through Expo.
 *
 * The plan reminder and the birthday greeting each carried their own copy of
 * this; group outings need it from request handlers too (an answer arriving,
 * a plan locked), so it lives here once. No SDK: it is one POST and a JSON
 * body.
 */
const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** url must start with "/": the app routes nothing else (mobile/src/lib/push.ts). */
  data: Record<string, string>;
}

/** Every device token for these accounts, keyed by user id. */
export async function tokensForUsers(db: SupabaseClient, userIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return out;
  const { data } = await db.from("push_tokens").select("token, user_id").in("user_id", ids);
  for (const t of (data ?? []) as { token: string; user_id: string }[]) {
    out.set(t.user_id, [...(out.get(t.user_id) ?? []), t.token]);
  }
  return out;
}

/**
 * Send, a hundred at a time (Expo's limit for one request).
 *
 * Failures are counted, not acted on: a token that fails once may be a phone
 * that is switched off rather than an install that is gone, and deleting on
 * the first failure is how somebody stops getting reminders because they flew
 * somewhere.
 */
export async function sendExpoPush(messages: PushMessage[]): Promise<{ sent: number; failures: string[] }> {
  let sent = 0;
  const failures: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    try {
      const res = await fetch(EXPO_PUSH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
      const json = (await res.json()) as { data?: { status: string; message?: string }[] };
      for (const ticket of json.data ?? []) {
        if (ticket.status === "ok") sent += 1;
        else failures.push(ticket.message ?? "unknown");
      }
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { sent, failures };
}
