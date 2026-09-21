import type Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "./supabase/server";

/**
 * Write down what a model call cost.
 *
 * Every call site that spends money should end with one of these. Chat has
 * logged its own usage into messages.usage since it shipped and that is what
 * made its cache hit rate knowable; the other three call sites logged nothing,
 * so a month billed at $14.52 could be attributed to thirty-one cents of it
 * and the rest was arithmetic.
 *
 * ── it may never break the thing it is measuring ────────────────────────
 * A plan must not fail because a spend log could not be written. Every path
 * here swallows its error, and the call is deliberately not awaited by its
 * callers. A missing row costs a slightly wrong report; a thrown error costs
 * somebody their evening.
 */
export type CallSite = "copy" | "research" | "ingest" | "verify" | "chat";

export async function recordUsage(
  callSite: CallSite,
  model: string,
  usage: Anthropic.Usage | null | undefined,
  opts: { ok?: boolean; ms?: number } = {}
): Promise<void> {
  try {
    const admin = createServiceClient();
    await admin.from("ai_usage").insert({
      call_site: callSite,
      model,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      /*
       * Both halves of caching, because they answer different questions.
       * Reads say the cache is working; writes say what it cost to fill, and
       * a site with writes and no reads is one whose prefix changes every
       * time -- which looks identical to "caching is on" from the outside.
       */
      cache_read_tokens: usage?.cache_read_input_tokens ?? 0,
      cache_write_tokens: usage?.cache_creation_input_tokens ?? 0,
      ok: opts.ok ?? true,
      duration_ms: opts.ms ?? null,
    });
  } catch (e) {
    // Never rethrown. See above.
    console.error(`could not record ${callSite} usage`, e);
  }
}

/**
 * A call that failed, and still cost input tokens.
 *
 * A refused or errored request is billed for what it read before it stopped,
 * and a site that only logs its successes will under-report in exactly the
 * situation worth investigating.
 */
export function recordFailure(callSite: CallSite, model: string, ms?: number): void {
  void recordUsage(callSite, model, null, { ok: false, ms });
}
