import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, parseModelJson, textFromResponse } from "./anthropic";

/**
 * Venue research — turn a name into a draft catalogue row.
 *
 * Adding a venue by hand means filling seventeen fields, several of which
 * (coordinates, price band, vibe tags) require looking the place up anyway.
 * This does the looking up: you type a name, it searches the web, and it comes
 * back with the row filled in and the sources it used.
 *
 * It deliberately does NOT invent menu prices. Menus come from the photo
 * ingest, where the prices are read off an actual menu — a model guessing what
 * a main course costs in Accra is exactly the failure mode that put unpriced
 * venues into plans as free evenings. Where sources describe cost in prose it
 * is reported as `price_signal` for a human to act on, and the per-person
 * figure is left at zero so the venue lands in the unpriced queue rather than
 * quietly carrying a fabricated number.
 *
 * Everything here is a draft. Nothing is written until an admin saves it.
 */
const MODEL = "claude-opus-5";

export const VENUE_TYPES = [
  "restaurant",
  "activity",
  "lounge",
  "outdoor",
  "cafe",
  "dessert",
] as const;

const VIBE_TAGS = [
  "calm",
  "lively",
  "romantic",
  "fun",
  "adventurous",
  "scenic",
  "upscale",
  "casual",
] as const;

const BEST_FOR = [
  "first_date",
  "anniversary",
  "date_night",
  "friend_outing",
  "casual_hangout",
] as const;

export const venueDraftSchema = z.object({
  found: z.boolean(),
  canonical_name: z.string().nullable().default(null),
  type: z.enum(VENUE_TYPES).nullable().default(null),
  area_name: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
  description: z.string().default(""),
  price_band: z.enum(["budget", "mid", "premium"]).nullable().default(null),
  /** Only when a source states actual prices. Prose signals go in price_signal. */
  avg_cost_per_person_ghs: z.number().min(0).default(0),
  price_signal: z.string().nullable().default(null),
  is_free: z.boolean().default(false),
  vibe_tags: z.array(z.enum(VIBE_TAGS)).default([]),
  best_for: z.array(z.enum(BEST_FOR)).default([]),
  reservation_required: z.boolean().default(false),
  dress_code: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  instagram_handle: z.string().nullable().default(null),
  google_maps_url: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
  lat: z.number().nullable().default(null),
  lng: z.number().nullable().default(null),
  confidence: z.number().min(0).max(1).default(0),
  /** Anything the admin should check before saving. */
  warnings: z.array(z.string()).default([]),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]),
});

export type VenueDraft = z.infer<typeof venueDraftSchema>;

function buildPrompt(name: string, areaHint: string): string {
  return `Research this venue in Accra, Ghana, and fill in a catalogue row for it.

Name as typed: ${name}
Area hint: ${areaHint || "(none given)"}

Search the web. Then return ONLY a JSON object, no prose around it:

{
  "found": boolean,
  "canonical_name": string|null,
  "type": "restaurant"|"activity"|"lounge"|"outdoor"|"cafe"|"dessert"|null,
  "area_name": string|null,
  "address": string|null,
  "description": string,
  "price_band": "budget"|"mid"|"premium"|null,
  "avg_cost_per_person_ghs": number,
  "price_signal": string|null,
  "is_free": boolean,
  "vibe_tags": string[],
  "best_for": string[],
  "reservation_required": boolean,
  "dress_code": string|null,
  "phone": string|null,
  "instagram_handle": string|null,
  "google_maps_url": string|null,
  "website": string|null,
  "lat": number|null,
  "lng": number|null,
  "confidence": 0.0-1.0,
  "warnings": string[],
  "sources": [{"title": string, "url": string}]
}

Rules that matter more than filling every field:
- Null and empty are always better than a plausible guess. Someone will act on
  this: a wrong phone number sends a customer to a stranger, and wrong
  coordinates send them to the wrong side of the city.
- "found": false if you cannot corroborate a venue by this name in Accra. Do
  not substitute a similarly-named place in another city — say so in warnings.
- "avg_cost_per_person_ghs": leave it 0 unless a source states actual prices in
  cedis. Do not estimate from the price band, from comparable venues, or from
  what such a place "usually" costs. Prose like "mains around 120-180" goes in
  price_signal instead, as a quote, and the number stays 0.
- "is_free": true only for places that genuinely charge nothing to enter, like
  a public beach or park. Never true merely because you could not find prices.
- "area_name": the Accra neighbourhood as locals say it (Osu, East Legon,
  Labone, Airport Residential, Spintex, Cantonments, Achimota…).
- "vibe_tags": only from ${VIBE_TAGS.join(", ")}.
- "best_for": only from ${BEST_FOR.join(", ")}.
- "description": one or two plain sentences on what the place actually is. No
  marketing language.
- Phone numbers in full international format (+233...).
- "warnings": anything an admin should check — conflicting sources, a venue
  that may have closed, several branches, a name that matches more than one
  business.
- Every entry in "sources" must be a page you actually consulted.`;
}

export interface ResearchResult {
  ok: true;
  draft: VenueDraft;
}
export interface ResearchFailure {
  ok: false;
  error: string;
}

/**
 * Look a venue up.
 *
 * Server tools can hand back `pause_turn` mid-search, so the response is
 * driven to completion rather than read once.
 */
export async function researchVenue(
  name: string,
  areaHint = "",
  options: { maxSearches?: number; effort?: "low" | "medium" | "high" } = {}
): Promise<ResearchResult | ResearchFailure> {
  const maxSearches = options.maxSearches ?? 5;
  const effort = options.effort ?? "medium";

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildPrompt(name, areaHint) },
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
          { type: "web_search_20260209", name: "web_search", max_uses: maxSearches },
        ],
        messages,
      });

      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
      }
      guard++;
    } while (response.stop_reason === "pause_turn" && guard < 4);
  } catch (e) {
    console.error("venue research failed", e);
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Rate limited — try again shortly." };
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "ANTHROPIC_API_KEY is missing or invalid." };
    }
    return { ok: false, error: "Could not reach the research service." };
  }

  if (response.stop_reason === "refusal") {
    return { ok: false, error: "The model declined to answer for this venue." };
  }

  try {
    const draft = venueDraftSchema.parse(
      parseModelJson<VenueDraft>(textFromResponse(response))
    );

    /*
     * Belt and braces on the one field that must never be invented. The prompt
     * forbids estimating a price, but a number that arrives alongside no
     * sources has nothing behind it, so it is dropped rather than trusted.
     */
    if (draft.avg_cost_per_person_ghs > 0 && !draft.sources.length) {
      draft.warnings.push("A price came back with no sources, so it was discarded.");
      draft.avg_cost_per_person_ghs = 0;
    }
    if (draft.is_free && draft.avg_cost_per_person_ghs > 0) {
      draft.warnings.push("Marked free but carried a price; the price was kept.");
      draft.is_free = false;
    }

    return { ok: true, draft };
  } catch (e) {
    console.error("venue research parse failed", e);
    return { ok: false, error: "The research came back in an unreadable shape." };
  }
}
