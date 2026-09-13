import { fetch as expoFetch } from "expo/fetch";
import { supabase } from "./supabase";

/**
 * The chat stream, read a chunk at a time.
 *
 * React Native's built-in fetch cannot stream a response body: awaiting it
 * resolves only once the whole thing has arrived, which for a turn that calls
 * three tools is ten seconds of a screen showing nothing. Expo ships a fetch
 * that does support it, and that is the only reason this import is not the
 * global one. If it ever regresses, the fallback is to drop the reader and
 * await res.text(), which still works: the events are newline-delimited and
 * parsing them in one go loses the progress, not the answer.
 *
 * The endpoint lives on the web app because it holds the model key. Same
 * arrangement as /api/generate, and for the same reason.
 */
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export type ChatEvent =
  | { type: "conversation"; id: string; remaining: number; tier: "free" | "pro" }
  | { type: "tool"; name: string; label: string }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** Thrown so the screen can show a paywall rather than an error. */
export class OutOfMessagesError extends Error {
  constructor(
    readonly tier: "free" | "pro",
    readonly used: number,
    readonly allowance: number
  ) {
    super("out_of_messages");
    this.name = "OutOfMessagesError";
  }
}

export class SignInRequiredError extends Error {
  constructor() {
    super("sign_in_required");
    this.name = "SignInRequiredError";
  }
}

export async function* streamChat(opts: {
  message: string;
  conversationId?: string;
  signal?: AbortSignal;
}): AsyncGenerator<ChatEvent> {
  if (!BASE) throw new Error("EXPO_PUBLIC_API_URL is unset, so chat cannot reach the server.");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new SignInRequiredError();

  const res = await expoFetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      message: opts.message,
      ...(opts.conversationId ? { conversation_id: opts.conversationId } : {}),
    }),
    signal: opts.signal,
  });

  if (res.status === 401) throw new SignInRequiredError();
  if (res.status === 402) {
    const body = (await res.json()) as { tier: "free" | "pro"; used: number; allowance: number };
    throw new OutOfMessagesError(body.tier, body.used, body.allowance);
  }
  if (!res.ok) throw new Error(`chat failed: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) {
    // No streaming available. Read it whole and replay the events in order, so
    // the conversation still works and only the progress is lost.
    const text = await res.text();
    for (const event of parseEvents(text).events) yield event;
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    // A chunk can split an event in half, so only whole ones are consumed and
    // the remainder stays in the buffer for the next read.
    const { events, rest } = parseEvents(buffer);
    buffer = rest;
    for (const event of events) yield event;
  }
}

/** Server-sent events are separated by a blank line and prefixed "data: ". */
function parseEvents(buffer: string): { events: ChatEvent[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: ChatEvent[] = [];

  for (const part of parts) {
    const line = part.trim();
    if (!line.startsWith("data:")) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()) as ChatEvent);
    } catch {
      // A malformed frame is dropped rather than ending the stream: losing one
      // progress line is better than losing the answer behind it.
    }
  }

  return { events, rest };
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: { type: string; text?: string }[];
  created_at: string;
}

/**
 * Past turns, read straight from Supabase.
 *
 * RLS scopes these to the signed-in user, so no endpoint is needed, the same
 * arrangement the catalogue and saved plans already use. Tool calls and their
 * results are stored alongside the prose and filtered out here: they are what
 * the model needed, not what the person said.
 */
export async function fetchConversation(conversationId: string): Promise<
  { role: "user" | "assistant"; text: string }[]
> {
  const { data } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return ((data ?? []) as StoredMessage[])
    .map((m) => ({
      role: m.role,
      text: (m.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join(""),
    }))
    .filter((m) => m.text.trim().length > 0);
}

/** The most recent thread, so the tab reopens where it was left. */
export async function fetchLatestConversation(): Promise<string | null> {
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}

/** How many messages are left, for the composer's footer. */
export async function fetchAllowance(): Promise<{
  tier: "free" | "pro";
  remaining: number;
  allowance: number;
} | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("entitlements")
    .select("tier, lifetime_messages_used")
    .eq("user_id", user.id)
    .maybeSingle();

  const row = data as { tier: "free" | "pro"; lifetime_messages_used: number } | null;

  // No row means they have never chatted, which is a full free tier rather
  // than no allowance: the row is created on the first spend.
  if (!row) return { tier: "free", remaining: FREE_LIFETIME, allowance: FREE_LIFETIME };
  if (row.tier === "pro") return { tier: "pro", remaining: Infinity, allowance: Infinity };

  return {
    tier: "free",
    remaining: Math.max(0, FREE_LIFETIME - Number(row.lifetime_messages_used ?? 0)),
    allowance: FREE_LIFETIME,
  };
}

/**
 * Mirrors FREE_LIFETIME_MESSAGES on the server, and is only ever used to draw
 * the footer. The server decides what may actually be spent; if these two ever
 * disagree, the server is right and this is cosmetic.
 */
const FREE_LIFETIME = 5;
