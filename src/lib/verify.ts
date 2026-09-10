import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, parseModelJson, textFromResponse } from "./anthropic";
import type { Venue } from "./types";

/**
 * Venue verification — checks a catalog row against the live web.
 *
 * The planner only ever recommends venues from our own table, so a fabricated
 * or long-closed row becomes a real person standing outside a building that
 * is not there. This asks Claude to search the web and either corroborate the
 * row with sources or say plainly that it could not.
 *
 * Uses a more capable model than the planner does: the failure we care about
 * is a confident wrong answer, and this runs a handful of times per venue
 * rather than on every user request.
 */
const MODEL = "claude-opus-5";

export interface VerifyOptions {
  /**
   * Search budget. A thorough pass needs ~6; each search costs roughly 10s of
   * wall clock, so a request running under a serverless timeout wants fewer.
   * Running out mid-check produces an honest "uncertain", not a wrong answer.
   */
  maxSearches?: number;
  /**
   * Reasoning depth. `medium` is right for a lookup; raise it when a venue is
   * ambiguous (chains, renamed businesses, several branches).
   */
  effort?: "low" | "medium" | "high";
}

export const verificationSchema = z.object({
  /** real = corroborated; closed = existed but has shut; not_found = no evidence. */
  verdict: z.enum(["real", "closed", "not_found", "uncertain"]),
  confidence: z.number().min(0).max(1),
  canonical_name: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
  neighbourhood: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  instagram_handle: z.string().nullable().default(null),
  google_maps_url: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
  /** What sources say about cost, in their words. Never a guess. */
  price_signal: z.string().nullable().default(null),
  /** Where our stored row disagrees with what was found. */
  discrepancies: z.array(z.string()).default([]),
  summary: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]),
});

export type Verification = z.infer<typeof verificationSchema>;

function buildPrompt(venue: Venue, areaName: string): string {
  return `Verify whether this venue is a real, currently-operating business in Accra, Ghana.

Our stored record:
- Name: ${venue.name}
- Type: ${venue.type}
- Area: ${areaName}
- Stored phone: ${venue.phone ?? "(none)"}
- Stored Instagram: ${venue.instagram_handle ?? "(none)"}
- Stored Maps URL: ${venue.google_maps_url ?? "(none)"}
- Stored average cost per person: GHS ${venue.avg_cost_per_person_ghs}
- Stored description: ${venue.description || "(none)"}

Search the web for it. Then return ONLY a JSON object, no prose around it:

{
  "verdict": "real" | "closed" | "not_found" | "uncertain",
  "confidence": 0.0-1.0,
  "canonical_name": string|null,
  "address": string|null,
  "neighbourhood": string|null,
  "phone": string|null,
  "instagram_handle": string|null,
  "google_maps_url": string|null,
  "website": string|null,
  "price_signal": string|null,
  "discrepancies": string[],
  "summary": string,
  "sources": [{"title": string, "url": string}]
}

Rules that matter more than completeness:
- Only report a field if you actually saw it in a source. Null is always better
  than a plausible guess. A wrong phone number sends a customer to a stranger.
- "real" requires corroboration you can cite. If all you find is an aggregator
  page that looks auto-generated, that is "uncertain", not "real".
- If the name matches nothing in Accra, say "not_found". Do not substitute a
  similarly-named venue in another city or country — call that out in summary.
- Put every mismatch between our stored record and what you found in
  "discrepancies" (wrong area, dead phone, different name, price far off).
- "price_signal" quotes what sources say about cost. Do not convert currencies
  or estimate. Null if nothing credible.
- Phone numbers in full international format (+233...).
- Every entry in "sources" must be a page you actually consulted.`;
}

/* ── batch verification ──────────────────────────────────────────────── */

export interface BatchVenue {
  venue: Venue;
  areaName: string;
}

export interface BatchVerdict {
  venueId: string;
  verification?: Verification;
  error?: string;
}

/**
 * Verify many venues through the Batch API.
 *
 * Catalogue verification is the opposite of latency-sensitive — nobody is
 * waiting on it — and batching halves the cost. Results come back keyed by
 * custom_id in any order, so they are matched by id rather than by position.
 *
 * Returns the batch id; poll it with `pollVerificationBatch`.
 */
export async function submitVerificationBatch(
  venues: BatchVenue[],
  options: VerifyOptions = {}
): Promise<string> {
  const maxSearches = options.maxSearches ?? 6;
  const effort = options.effort ?? "high";

  const batch = await anthropic.messages.batches.create({
    requests: venues.map(({ venue, areaName }) => ({
      custom_id: venue.id,
      params: {
        model: MODEL,
        max_tokens: 8000,
        output_config: { effort },
        tools: [
          { type: "web_search_20260209" as const, name: "web_search", max_uses: maxSearches },
        ],
        messages: [{ role: "user" as const, content: buildPrompt(venue, areaName) }],
      },
    })),
  });

  return batch.id;
}

/** Batch status. `ended` means every request has a result, success or not. */
export async function verificationBatchStatus(
  batchId: string
): Promise<{ status: string; counts: Record<string, number> }> {
  const batch = await anthropic.messages.batches.retrieve(batchId);
  return {
    status: batch.processing_status,
    counts: batch.request_counts as unknown as Record<string, number>,
  };
}

/** Read a finished batch. Order is not guaranteed, so verdicts carry their id. */
export async function readVerificationBatch(batchId: string): Promise<BatchVerdict[]> {
  const out: BatchVerdict[] = [];

  for await (const entry of await anthropic.messages.batches.results(batchId)) {
    const venueId = entry.custom_id;

    if (entry.result.type !== "succeeded") {
      out.push({ venueId, error: `Batch request ${entry.result.type}.` });
      continue;
    }

    const message = entry.result.message;
    if (message.stop_reason === "refusal") {
      out.push({ venueId, error: "The model declined to answer for this venue." });
      continue;
    }

    try {
      out.push({
        venueId,
        verification: verificationSchema.parse(
          parseModelJson<Verification>(textFromResponse(message as never))
        ),
      });
    } catch {
      out.push({ venueId, error: "Unreadable verification." });
    }
  }

  return out;
}

export interface VerifyResult {
  ok: true;
  verification: Verification;
  searchesUsed: number;
}
export interface VerifyFailure {
  ok: false;
  error: string;
}

/**
 * Runs the verification. Server tools can hand back `pause_turn` when the
 * model needs another round trip mid-search, so the response is driven to
 * completion rather than read once.
 */
export async function verifyVenue(
  venue: Venue,
  areaName: string,
  options: VerifyOptions = {}
): Promise<VerifyResult | VerifyFailure> {
  const maxSearches = options.maxSearches ?? 4;
  const effort = options.effort ?? "medium";

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildPrompt(venue, areaName) },
  ];

  let response: Anthropic.Message;
  let guard = 0;

  try {
    do {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8000,
        output_config: { effort },
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: maxSearches,
          },
        ],
        messages,
      });

      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
      }
      guard++;
    } while (response.stop_reason === "pause_turn" && guard < 4);
  } catch (e) {
    console.error("verification call failed", e);
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Rate limited by the API — try again shortly." };
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "ANTHROPIC_API_KEY is missing or invalid." };
    }
    return { ok: false, error: "Could not reach the verification service." };
  }

  if (response.stop_reason === "refusal") {
    return { ok: false, error: "The model declined to answer for this venue." };
  }

  const searchesUsed = response.content.filter(
    (b) => b.type === "web_search_tool_result"
  ).length;

  try {
    const parsed = verificationSchema.parse(
      parseModelJson<Verification>(textFromResponse(response))
    );
    return { ok: true, verification: parsed, searchesUsed };
  } catch (e) {
    console.error("verification parse failed", e);
    return { ok: false, error: "The verification came back in an unreadable shape." };
  }
}
