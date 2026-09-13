import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "../../anthropic";
import type { ChatBlock, ModelReply, ModelRequest, Provider, StopReason } from "../model";

/**
 * Claude, behind the common interface.
 *
 * Sonnet rather than Haiku, decided by measurement rather than by price list.
 *
 * The plan called for Haiku 4.5 at $1/$5 against Sonnet 5's $2/$10. Then the
 * prefix was counted: system plus five tools is 2,599 tokens. Haiku 4.5 will
 * not cache a prefix below 4,096, four times Sonnet's 1,024 floor, and it does
 * not warn, it simply bills the whole prefix at full rate on every turn. So
 * the real comparison on this workload is Haiku uncached against Sonnet
 * cached, which is roughly $0.0064 a turn against $0.0080. Twenty-five per
 * cent, not half, for a model that is markedly better at the thing this
 * feature is entirely about: refusing to answer when the catalogue is silent.
 *
 * Padding the prompt to clear 4,096 would buy the cache back, and would mean
 * writing a thousand tokens of instruction nobody needs in order to qualify
 * for a discount. Not worth having.
 *
 * ANTHROPIC_CHAT_MODEL overrides, so the eval can put the two against the same
 * questions without a deploy. Re-count the prefix if the tools grow: crossing
 * 4,096 makes Haiku viable again and the maths changes back.
 */
const DEFAULT_MODEL = "claude-sonnet-5";

export function anthropicProvider(): Provider {
  const model = process.env.ANTHROPIC_CHAT_MODEL ?? DEFAULT_MODEL;

  return {
    id: "anthropic",
    model,

    async send(req: ModelRequest): Promise<ModelReply> {
      const response = await anthropic.messages.create({
        model,
        max_tokens: req.maxTokens,
        /*
         * Off, and deliberately.
         *
         * Sonnet 5 thinks by default when the parameter is omitted, and
         * thinking is billed as output at five times the input rate and read
         * by the user as a pause. Choosing a tool and narrating its result is
         * not deliberation.
         *
         * It also protects the budget: copy.ts once ran at max_tokens 1500
         * with thinking on, the thinking consumed the whole allowance, and
         * every plan silently fell back to placeholder prose. The same
         * ceiling is in force here.
         *
         * Only sent for models that accept it. Haiku 4.5 does not think unless
         * asked, and takes a different parameter when it does.
         */
        ...(model.startsWith("claude-sonnet-5") || model.startsWith("claude-opus")
          ? { thinking: { type: "disabled" as const } }
          : {}),
        system: [
          {
            type: "text",
            text: req.system,
            /*
             * Tools render before system, so one breakpoint on the last system
             * block caches both together. This is the whole prefix and it is
             * byte-identical on every request, which is the only reason it can
             * be cached at all: anything interpolated here, a date or a user
             * id, would invalidate it for every conversation at once.
             */
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          // Through unknown: our JsonSchema is a closed shape and theirs
          // carries an index signature, so the two do not overlap by
          // structure even though the bytes on the wire are identical.
          input_schema: t.parameters as unknown as Anthropic.Tool.InputSchema,
        })),
        messages: req.messages.map(toAnthropicTurn),
      });

      return {
        blocks: fromAnthropicContent(response.content),
        stopReason: stopReasonOf(response.stop_reason),
        usage: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          cacheRead: response.usage.cache_read_input_tokens ?? 0,
          cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
          model,
          provider: "anthropic",
        },
      };
    },
  };
}

function toAnthropicTurn(turn: {
  role: "user" | "assistant";
  content: ChatBlock[];
}): Anthropic.MessageParam {
  return {
    role: turn.role,
    content: turn.content.map((b): Anthropic.ContentBlockParam => {
      if (b.type === "text") return { type: "text", text: b.text };
      if (b.type === "tool_use") {
        return { type: "tool_use", id: b.id, name: b.name, input: b.input as object };
      }
      return {
        type: "tool_result",
        tool_use_id: b.tool_use_id,
        content: b.content,
        ...(b.is_error ? { is_error: true } : {}),
      };
    }),
  };
}

function fromAnthropicContent(content: Anthropic.ContentBlock[]): ChatBlock[] {
  const out: ChatBlock[] = [];
  for (const b of content) {
    if (b.type === "text") out.push({ type: "text", text: b.text });
    else if (b.type === "tool_use") {
      out.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
    }
    // Thinking blocks are not requested and nothing else is expected here.
  }
  return out;
}

function stopReasonOf(reason: string | null): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}
