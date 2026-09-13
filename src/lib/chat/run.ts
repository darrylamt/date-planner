import { CHAT_TOOLS, runTool, type ToolContext } from "./tools";
import {
  MAX_TOKENS,
  MAX_TOOL_ROUNDS,
  textOf,
  toolCallsOf,
  trimHistory,
  type ChatBlock,
  type ChatTurn,
  type ModelUsage,
  type Provider,
} from "./model";

/**
 * One user message, answered.
 *
 * A generator rather than a function returning a string, because a turn that
 * calls three tools takes several seconds and a phone showing nothing for
 * several seconds reads as broken. The caller streams these events; the last
 * one carries what must be written to the database.
 *
 * The loop itself is deliberately dull. It calls the model, runs whatever
 * tools it asked for, hands the results back, and stops. Every decision about
 * what is true lives in the tools, and every decision about what to say lives
 * in the system prompt. There is nothing here that could invent a venue.
 */
export type ChatEvent =
  | { type: "tool"; name: string; label: string }
  | { type: "text"; text: string }
  | { type: "done"; turns: ChatTurn[]; usage: ModelUsage[] }
  | { type: "error"; message: string };

/** What the app says while a tool runs. Server-side so both clients agree. */
const TOOL_LABEL: Record<string, string> = {
  search_venues: "Looking through the catalogue",
  get_venue: "Reading the details",
  search_menu_items: "Searching menus",
  check_opening_hours: "Checking opening hours",
  estimate_budget: "Working out the cost",
};

export async function* runChat(opts: {
  provider: Provider;
  system: string;
  /** Turns already on this conversation, oldest first. */
  history: ChatTurn[];
  /** What the person just sent, already prefixed with any opening context. */
  userContent: string;
  ctx: ToolContext;
}): AsyncGenerator<ChatEvent> {
  const { provider, system, ctx } = opts;

  const userTurn: ChatTurn = {
    role: "user",
    content: [{ type: "text", text: opts.userContent }],
  };

  // What this exchange adds, returned at the end so the caller can persist it.
  const added: ChatTurn[] = [userTurn];
  const usage: ModelUsage[] = [];

  let messages: ChatTurn[] = [...trimHistory(opts.history), userTurn];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let reply;
    try {
      reply = await provider.send({
        system,
        tools: CHAT_TOOLS,
        messages,
        maxTokens: MAX_TOKENS,
      });
    } catch (e) {
      console.error("chat provider failed", e);
      yield {
        type: "error",
        message: "We could not reach the assistant just now. Try again in a moment.",
      };
      return;
    }

    usage.push(reply.usage);

    /*
     * A refusal and a truncation both arrive as missing text and need opposite
     * fixes, so they are named separately rather than both becoming "no
     * answer". copy.ts learned this the expensive way: at max_tokens 1500 the
     * thinking ate the whole budget and every plan silently fell back.
     */
    if (reply.stopReason === "refusal") {
      yield { type: "error", message: "I can't help with that one." };
      return;
    }

    const assistantTurn: ChatTurn = { role: "assistant", content: reply.blocks };
    added.push(assistantTurn);
    messages = [...messages, assistantTurn];

    const text = textOf(reply.blocks);
    if (text) yield { type: "text", text };

    const calls = toolCallsOf(reply.blocks);
    if (!calls.length) {
      if (!text) {
        yield {
          type: "error",
          message:
            reply.stopReason === "max_tokens"
              ? "That answer was cut off before it finished. Ask me again, more narrowly."
              : "I did not manage an answer to that. Try rephrasing it.",
        };
        return;
      }
      yield { type: "done", turns: added, usage };
      return;
    }

    /*
     * Run them together, and return every result in one turn. Splitting tool
     * results across several turns teaches a model to stop asking for more
     * than one at a time, which costs a round trip on every later question.
     */
    const results: ChatBlock[] = [];
    for (const call of calls) {
      yield { type: "tool", name: call.name, label: TOOL_LABEL[call.name] ?? "Looking that up" };
    }

    await Promise.all(
      calls.map(async (call) => {
        const outcome = await runTool(call.name, call.input, ctx);
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(outcome.content),
          ...(outcome.isError ? { is_error: true } : {}),
        });
      })
    );

    const resultTurn: ChatTurn = { role: "user", content: results };
    added.push(resultTurn);
    messages = [...messages, resultTurn];
  }

  /*
   * Out of rounds. Every pass resends the whole conversation, so a model that
   * keeps searching instead of answering costs more with each attempt; this is
   * a cost ceiling as much as a safety one. Said plainly rather than dressed
   * up, because the user asked something we could not close out.
   */
  yield {
    type: "error",
    message: "I looked but could not settle that one. Try asking for something more specific.",
  };
}
