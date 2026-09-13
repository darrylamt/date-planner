import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { consumeMessage } from "@/lib/entitlements";
import { buildToolContext, todayInAccra } from "@/lib/chat/tools";
import { getProvider, type ChatTurn, type ModelUsage } from "@/lib/chat/model";
import { SYSTEM, buildOpeningContext } from "@/lib/chat/system";
import { runChat } from "@/lib/chat/run";

/**
 * The chat endpoint.
 *
 * Lives here rather than in the app because it holds the model key, which
 * cannot ship in a binary anyone can unpack. The app calls it the same way it
 * already calls /api/generate.
 *
 * The order of the first three steps is the whole safety story: identify the
 * caller from their own token, spend one message against their allowance, and
 * only then call a model. Charging after the answer would mean a request that
 * fails halfway costs real money and meters nothing, and the failure that
 * matters is the one that keeps failing.
 */
export const maxDuration = 120;

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  conversation_id: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  /*
   * Bearer only. The app has no cookie jar, and an unauthenticated chat is an
   * unmetered bill: there would be nobody to charge the message to and nothing
   * stopping one person from sending a million.
   */
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "sign_in_required" }, 401);

  const admin = createServiceClient();
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const userId = authError ? null : auth.user?.id;
  if (!userId) return json({ error: "sign_in_required" }, 401);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  // Before the model, always.
  const spend = await consumeMessage(userId);
  if (!spend.allowed) {
    return json(
      {
        error: "out_of_messages",
        tier: spend.tier,
        used: spend.used,
        allowance: spend.allowance,
      },
      402
    );
  }

  const conversationId = await ensureConversation(admin, userId, body.conversation_id, body.message);
  if (!conversationId) return json({ error: "conversation_not_found" }, 404);

  const history = await loadHistory(admin, conversationId);

  /*
   * The date and the area names ride on the first user turn rather than in the
   * system prompt. In the prompt they would change the cached prefix at
   * midnight, for everybody at once; here they cost a few tokens and
   * invalidate nothing.
   */
  const today = todayInAccra();
  const ctx = buildToolContext(userId);
  const { data: areas } = await ctx.catalog.from("areas").select("name").order("name");
  const areaNames = ((areas ?? []) as { name: string }[]).map((a) => a.name);

  const userContent = history.length
    ? body.message
    : `${buildOpeningContext(today, areaNames)}\n\n${body.message}`;

  const provider = getProvider();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      // Sent first so the app can pin a new conversation before any text.
      send({ type: "conversation", id: conversationId, remaining: spend.remaining, tier: spend.tier });

      try {
        for await (const event of runChat({ provider, system: SYSTEM, history, userContent, ctx })) {
          if (event.type === "done") {
            await persist(admin, conversationId, event.turns, event.usage);
            send({ type: "done" });
            continue;
          }
          if (event.type === "error") {
            /*
             * The exchange is still written. A conversation missing the turn
             * that failed reads, next time it is opened, as though the person
             * never asked, and the model then answers a follow-up to a
             * question it cannot see.
             */
            send(event);
            continue;
          }
          send(event);
        }
      } catch (e) {
        console.error("chat stream failed", e);
        send({ type: "error", message: "Something went wrong mid-answer. Try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Vercel and nginx both buffer by default, which holds every event back
      // until the response ends and turns a stream into a long pause.
      "X-Accel-Buffering": "no",
    },
  });
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The conversation to append to, creating one on the first message. */
async function ensureConversation(
  admin: ReturnType<typeof createServiceClient>,
  userId: string,
  existing: string | undefined,
  firstMessage: string
): Promise<string | null> {
  if (existing) {
    // Confirmed to be theirs. The id arrives from the client, so without this
    // anyone could append to, and then read back, somebody else's thread.
    const { data } = await admin
      .from("conversations")
      .select("id")
      .eq("id", existing)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;

    await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", existing);
    return existing;
  }

  const { data, error } = await admin
    .from("conversations")
    .insert({ user_id: userId, title: titleFrom(firstMessage) })
    .select("id")
    .single();

  if (error) {
    console.error("could not open a conversation", error);
    return null;
  }
  return (data as { id: string }).id;
}

/** Enough of the first message to recognise the thread in a list. */
function titleFrom(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length <= 60 ? clean : `${clean.slice(0, 57)}…`;
}

async function loadHistory(
  admin: ReturnType<typeof createServiceClient>,
  conversationId: string
): Promise<ChatTurn[]> {
  const { data } = await admin
    .from("messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return ((data ?? []) as { role: "user" | "assistant"; content: ChatTurn["content"] }[]).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * Write the exchange.
 *
 * Content blocks in full, not the rendered text. A turn that called a tool is
 * a tool_use block and its matching result, and the next request has to replay
 * both or the model is answering about a call it cannot see. Usage is attached
 * to the assistant turns that incurred it, which is the only way to find out
 * later what a conversation actually cost and whether the prefix cached.
 */
async function persist(
  admin: ReturnType<typeof createServiceClient>,
  conversationId: string,
  turns: ChatTurn[],
  usage: ModelUsage[]
): Promise<void> {
  let spent = 0;
  const rows = turns.map((turn) => ({
    conversation_id: conversationId,
    role: turn.role,
    content: turn.content,
    usage: turn.role === "assistant" ? (usage[spent++] ?? null) : null,
  }));

  const { error } = await admin.from("messages").insert(rows);
  if (error) console.error("could not save the exchange", error);
}
