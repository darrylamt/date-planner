import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What a chat tool is.
 *
 * The division of labour the whole feature rests on: a tool reads the
 * catalogue and returns data, the model turns data into sentences. The model
 * never queries, never arithmetics a price, and never states a fact that did
 * not come back from one of these. A tool that returns nothing is the model's
 * cue to say we do not have it, which is the honest answer and the one the
 * rest of this codebase already goes out of its way to give.
 */
export interface ToolContext {
  /**
   * Anon-level, and deliberately so.
   *
   * Migrations 0013 and 0014 revoked the blanket venue grant precisely so that
   * unapproved phone numbers and the verification internals are unreadable
   * rather than merely unread. Running catalogue tools through this client
   * means Postgres enforces that, instead of every tool author remembering to.
   * A tool that needs the service role to read the catalogue is a tool doing
   * something it should not.
   */
  catalog: SupabaseClient;

  /**
   * Service role, for the caller's own rows only. Every query through this
   * must filter on userId explicitly: it bypasses RLS, so the filter is the
   * only thing standing between one user and another's history.
   */
  admin: SupabaseClient;

  userId: string;

  /** Today in Accra, ISO yyyy-mm-dd. Ghana is GMT year-round. */
  today: string;
}

/**
 * A tool as the model sees it and as we run it.
 *
 * `parameters` is hand-written JSON Schema rather than generated from the zod
 * schema, because it is prompt text: the model reads these descriptions to
 * decide what to call and with what, and they are worth wording carefully and
 * keeping short. `parse` is the runtime guard on what comes back, since a
 * model may send anything at all.
 */
export interface ChatTool<Args = unknown> {
  name: string;
  description: string;
  parameters: JsonSchema;
  parse: (raw: unknown) => Args;
  run: (args: Args, ctx: ToolContext) => Promise<unknown>;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

/** Today in Accra. Ghana keeps GMT all year, so UTC is the local calendar. */
export function todayInAccra(): string {
  return new Date().toISOString().slice(0, 10);
}
