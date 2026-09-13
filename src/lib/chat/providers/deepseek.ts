import type { ChatBlock, ModelReply, ModelRequest, Provider, StopReason } from "../model";

/**
 * DeepSeek, behind the common interface.
 *
 * Reached over plain fetch rather than by adding an SDK. The endpoint is
 * OpenAI-compatible and this file uses four fields of it, which is not worth a
 * dependency in a project whose whole production tree is six packages.
 *
 * The shape difference from Anthropic is not cosmetic and is the reason the
 * adapter exists at all. There, a tool result is a block inside a user turn;
 * here it is a message of its own with role "tool". A conversation is stored
 * in the canonical shape and translated on the way out, so the same history
 * replays correctly whichever provider is answering today.
 *
 * Worth knowing before trusting the price: DeepSeek bills peak rates from
 * 01:00 to 04:00 and 06:00 to 10:00 UTC on weekdays, double the off-peak. Ghana
 * keeps GMT all year, so Accra evenings and weekends, which is when anybody
 * plans a date, fall entirely in the cheap window.
 */
const BASE_URL = "https://api.deepseek.com";

/**
 * The alias that tracks their current chat model. Overridable, because model
 * names at this end of the market change often: Kimi K2.5 was retired in
 * August and now returns 404 to anything still asking for it.
 */
const DEFAULT_MODEL = "deepseek-chat";

interface DeepSeekToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface DeepSeekMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: DeepSeekToolCall[];
  tool_call_id?: string;
}

export function deepseekProvider(): Provider {
  const model = process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const apiKey = process.env.DEEPSEEK_API_KEY;

  return {
    id: "deepseek",
    model,

    async send(req: ModelRequest): Promise<ModelReply> {
      if (!apiKey) {
        throw new Error("DEEPSEEK_API_KEY is not set, so CHAT_PROVIDER=deepseek cannot run.");
      }

      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens,
          // The system prompt leads, so their automatic context caching has a
          // stable prefix to match on, the same property the Anthropic
          // breakpoint relies on.
          messages: [{ role: "system", content: req.system }, ...req.messages.flatMap(toDeepSeekMessages)],
          tools: req.tools.map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          })),
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`DeepSeek ${res.status}: ${detail.slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        choices: { message: DeepSeekMessage; finish_reason: string }[];
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          prompt_cache_hit_tokens?: number;
          prompt_cache_miss_tokens?: number;
        };
      };

      const choice = json.choices?.[0];
      if (!choice) throw new Error("DeepSeek returned no choices.");

      return {
        blocks: fromDeepSeekMessage(choice.message),
        stopReason: stopReasonOf(choice.finish_reason),
        usage: {
          /*
           * prompt_tokens counts cache hits as well as misses, so reporting it
           * whole alongside the hit count would double-count. The miss count
           * is what was actually charged at the full rate.
           */
          input:
            json.usage?.prompt_cache_miss_tokens ??
            json.usage?.prompt_tokens ??
            0,
          output: json.usage?.completion_tokens ?? 0,
          cacheRead: json.usage?.prompt_cache_hit_tokens ?? 0,
          // Their caching is automatic and writes are not billed separately.
          cacheWrite: 0,
          model,
          provider: "deepseek",
        },
      };
    },
  };
}

/**
 * One canonical turn becomes one or more DeepSeek messages.
 *
 * The awkward case is a user turn carrying tool results: canonically that is
 * one turn, and here each result has to become its own `role: "tool"` message
 * addressed by tool_call_id. Any text in the same turn follows as a user
 * message, so the ordering the model reads matches the ordering it produced.
 */
function toDeepSeekMessages(turn: { role: "user" | "assistant"; content: ChatBlock[] }): DeepSeekMessage[] {
  const out: DeepSeekMessage[] = [];

  const results = turn.content.filter(
    (b): b is Extract<ChatBlock, { type: "tool_result" }> => b.type === "tool_result"
  );
  for (const r of results) {
    out.push({ role: "tool", tool_call_id: r.tool_use_id, content: r.content });
  }

  const text = turn.content
    .filter((b): b is Extract<ChatBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  const calls = turn.content.filter(
    (b): b is Extract<ChatBlock, { type: "tool_use" }> => b.type === "tool_use"
  );

  if (turn.role === "assistant") {
    // An assistant turn that only called tools still has to be replayed, or
    // the tool messages that follow it refer to a call that never happened.
    if (text || calls.length) {
      out.push({
        role: "assistant",
        content: text || null,
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
              })),
            }
          : {}),
      });
    }
  } else if (text) {
    out.push({ role: "user", content: text });
  }

  return out;
}

function fromDeepSeekMessage(message: DeepSeekMessage): ChatBlock[] {
  const out: ChatBlock[] = [];
  if (message.content) out.push({ type: "text", text: message.content });

  for (const call of message.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = JSON.parse(call.function.arguments || "{}");
    } catch {
      /*
       * Left as an empty object rather than thrown. The tool layer validates
       * every argument set anyway and returns a readable error the model can
       * correct on the next pass, which is a better outcome than killing the
       * turn over one malformed call.
       */
    }
    out.push({ type: "tool_use", id: call.id, name: call.function.name, input });
  }

  return out;
}

function stopReasonOf(reason: string): StopReason {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    default:
      return "other";
  }
}
