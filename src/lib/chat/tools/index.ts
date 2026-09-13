import { createClient, createServiceClient } from "../../supabase/server";
import type { ChatTool, ToolContext } from "./types";
import { todayInAccra } from "./types";
import { searchVenues } from "./searchVenues";
import { getVenue } from "./getVenue";
import { searchMenuItems } from "./searchMenuItems";
import { checkOpeningHours } from "./checkOpeningHours";
import { estimateBudget } from "./estimateBudget";

/**
 * The tools, in a fixed order.
 *
 * Fixed because the order is part of the cached prompt prefix. Tools render
 * before the system prompt, so shuffling this array moves bytes at the very
 * front of every request and invalidates the cache for the whole conversation
 * behind it. Add to the end; do not sort.
 */
export const CHAT_TOOLS: ChatTool<never>[] = [
  searchVenues,
  getVenue,
  searchMenuItems,
  checkOpeningHours,
  estimateBudget,
] as unknown as ChatTool<never>[];

const BY_NAME = new Map<string, ChatTool<never>>(CHAT_TOOLS.map((t) => [t.name, t]));

export { todayInAccra };
export type { ChatTool, ToolContext };

/**
 * The clients a tool run needs.
 *
 * catalog is anon-level on purpose, so the column grants from 0013 and 0014
 * enforce the phone gate rather than each tool remembering to. admin is the
 * service role and is only ever for the caller's own rows.
 */
export function buildToolContext(userId: string): ToolContext {
  return {
    catalog: createClient(),
    admin: createServiceClient(),
    userId,
    today: todayInAccra(),
  };
}

export interface ToolOutcome {
  /** JSON the model reads back as the tool_result block. */
  content: unknown;
  /** True when the call failed rather than returned nothing. */
  isError: boolean;
}

/**
 * Run one tool call from the model.
 *
 * Every failure comes back as a result the model can read rather than an
 * exception that kills the turn. A model that sent bad arguments can fix them
 * on the next pass if it is told what was wrong; a model whose request threw
 * gets a dead conversation and the user gets nothing. The one thing never done
 * here is inventing a plausible answer to paper over a failed call.
 */
export async function runTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const tool = BY_NAME.get(name);
  if (!tool) {
    return {
      isError: true,
      content: { error: `No tool named ${name}. Available: ${[...BY_NAME.keys()].join(", ")}.` },
    };
  }

  let args: never;
  try {
    args = tool.parse(rawArgs) as never;
  } catch (e) {
    return {
      isError: true,
      content: {
        error: "Those arguments are not valid for this tool.",
        detail: e instanceof Error ? e.message : String(e),
      },
    };
  }

  try {
    return { isError: false, content: await tool.run(args, ctx) };
  } catch (e) {
    // Logged in full server-side; the model is told only that it failed, so a
    // database error message never becomes part of the conversation.
    console.error(`chat tool ${name} failed`, e);
    return {
      isError: true,
      content: {
        error: `The ${name} lookup failed. Tell the user something went wrong on our side; do not answer from memory.`,
      },
    };
  }
}
