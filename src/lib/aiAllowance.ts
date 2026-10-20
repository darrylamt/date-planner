import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Who is asking Gemini to read something, and whether they may today.
 *
 * Portal accounts only: an admin, somebody who runs a venue, an active
 * planner, a cake or flower vendor. Never an app user; the free allowance is
 * the project's, for catalogue work. Admins are unlimited. Everyone else
 * shares the day fairly: DAILY_READS each, counted in ai_reads (0087).
 *
 * Until 0087 is run there is nothing to count in, and reads are allowed
 * rather than refused: the free tier's own limit is still there behind it.
 */
export const DAILY_READS = 25;

export type AiCaller = {
  userId: string;
  admin: boolean;
  venueIds: string[];
  planner: boolean;
  vendor: boolean;
};

export async function aiCaller(): Promise<AiCaller | null> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return null;
  const db = createServiceClient();
  const [{ data: profile }, { data: runs }, { data: planner }, { data: vendor }] = await Promise.all([
    db.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
    db.from("venue_users").select("venue_id").eq("user_id", user.id),
    db.from("event_planners").select("is_active").eq("user_id", user.id).maybeSingle(),
    db.from("vendor_users").select("vendor_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const caller: AiCaller = {
    userId: user.id,
    admin: Boolean((profile as { is_admin?: boolean } | null)?.is_admin),
    venueIds: ((runs ?? []) as { venue_id: string }[]).map((r) => r.venue_id),
    planner: Boolean((planner as { is_active?: boolean } | null)?.is_active),
    vendor: Boolean(vendor),
  };
  return caller.admin || caller.venueIds.length || caller.planner || caller.vendor ? caller : null;
}

/** Take one read from today's share, or say there are none left. */
export async function takeRead(caller: AiCaller, kind: "menu" | "flyer" | "venue"): Promise<{ ok: true } | { ok: false; message: string }> {
  if (caller.admin) return { ok: true };
  const db = createServiceClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await db
    .from("ai_reads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", caller.userId)
    .gte("created_at", since);
  if (error) return { ok: true };
  if ((count ?? 0) >= DAILY_READS) {
    return { ok: false, message: `That's ${DAILY_READS} reads in a day, the most one account gets. Try again tomorrow, or fill it in by hand.` };
  }
  await db.from("ai_reads").insert({ user_id: caller.userId, kind });
  return { ok: true };
}
