import type { ChatTool } from "./tools";

/**
 * One shape for a conversation, whoever is answering it.
 *
 * The chat loop is the only high-volume model call aduro will make, and the
 * providers that could serve it differ by roughly eight times in price. That
 * difference is worth keeping reachable, but not at the cost of a second
 * implementation of the loop, the honesty rules or the tool layer. So the loop
 * speaks these types, and a provider is the thing that translates them.
 *
 * Nothing above this file knows whether it is talking to Anthropic. Swapping
 * provider is an environment variable; it is not a rewrite, and it does not
 * invalidate a stored conversation, because what is stored is this shape
 * rather than any provider's wire format.
 */

export type ChatBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface ChatTurn {
  role: "user" | "assistant";
  content: ChatBlock[];
}

/**
 * Why the model stopped. "refusal" is separated from the rest because it and a
 * truncation both arrive as missing text and need opposite fixes, a lesson
 * copy.ts already paid for.
 */
export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface ModelUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  model: string;
  provider: string;
}

export interface ModelReply {
  blocks: ChatBlock[];
  stopReason: StopReason;
  usage: ModelUsage;
}

export interface ModelRequest {
  /** Byte-stable across every request, so it can be cached. */
  system: string;
  tools: ChatTool<never>[];
  messages: ChatTurn[];
  maxTokens: number;
}

export interface Provider {
  readonly id: string;
  readonly model: string;
  send(req: ModelRequest): Promise<ModelReply>;
}

/**
 * Output is the expensive half, at five times the input rate on every provider
 * in the running. A chat turn is a few sentences and a tool call; anything
 * approaching this ceiling has gone wrong rather than gone long.
 */
export const MAX_TOKENS = 1500;

/**
 * How many tool calls one user message may set off before the loop gives up.
 *
 * Not a safety valve so much as a cost ceiling: every pass resends the whole
 * conversation, so a model that keeps searching instead of answering costs
 * quadratically. Six is enough for search, detail, hours and a follow-up.
 */
export const MAX_TOOL_ROUNDS = 6;

/**
 * Turns kept before the oldest are dropped.
 *
 * History is resent in full on every request, so an unbounded conversation is
 * an unbounded bill. Trimming is deterministic and free, which is worth more
 * here than a cleverer scheme that costs a summarisation call to run.
 */
export const MAX_HISTORY_TURNS = 20;

/**
 * Which provider answers.
 *
 * Read from the environment rather than decided here, so the eval can put two
 * of them against the same questions without a deploy. Anthropic is the
 * default because it is the one this project already holds credit with.
 */
export function getProvider(): Provider {
  const id = (process.env.CHAT_PROVIDER ?? "anthropic").toLowerCase();

  switch (id) {
    case "deepseek":
      // Required lazily so a missing DEEPSEEK_API_KEY cannot break the
      // Anthropic path at module load.
      return require("./providers/deepseek").deepseekProvider() as Provider;
    case "anthropic":
      return require("./providers/anthropic").anthropicProvider() as Provider;
    default:
      throw new Error(
        `CHAT_PROVIDER is "${id}", which is not a provider. Use "anthropic" or "deepseek".`
      );
  }
}

/** Every text block in a reply, joined. */
export function textOf(blocks: ChatBlock[]): string {
  return blocks
    .filter((b): b is Extract<ChatBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** The tool calls in a reply, in the order the model made them. */
export function toolCallsOf(blocks: ChatBlock[]): Extract<ChatBlock, { type: "tool_use" }>[] {
  return blocks.filter(
    (b): b is Extract<ChatBlock, { type: "tool_use" }> => b.type === "tool_use"
  );
}

/**
 * Drop the oldest turns, and hollow out tool results that are no longer being
 * discussed.
 *
 * A tool result is the biggest thing in the history and the least re-read: a
 * venue search matters while the model is choosing from it and is dead weight
 * four turns later, when its conclusions are already in the prose. Replacing
 * the body with a stub keeps the tool_use and tool_result pairing intact,
 * which every provider requires, while removing what it cost to carry.
 */
export function trimHistory(turns: ChatTurn[], keep = MAX_HISTORY_TURNS): ChatTurn[] {
  const recent = turns.slice(-keep);
  const liveFrom = Math.max(0, recent.length - 4);

  return recent.map((turn, i) =>
    i >= liveFrom
      ? turn
      : {
          ...turn,
          content: turn.content.map((b) =>
            b.type === "tool_result"
              ? { ...b, content: "[earlier result, no longer shown]" }
              : b
          ),
        }
  );
}
