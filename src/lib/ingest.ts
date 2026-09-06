import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, parseModelJson, textFromResponse } from "./anthropic";

/**
 * Menu ingestion — turns a menu photo or a menu URL into a structured venue
 * plus its menu items, ready to be written as a migration.
 *
 * The model reads; it never invents. Prices in this catalog are summed against
 * a real person's budget, so a hallucinated price is worse than a missing one.
 * Anything unreadable goes to `warnings` rather than being filled in.
 */
const MODEL = "claude-opus-5";

export const MENU_CATEGORIES = ["starter", "main", "dessert", "drink", "other"] as const;
export const VENUE_TYPES = [
  "restaurant",
  "activity",
  "lounge",
  "outdoor",
  "cafe",
  "dessert",
] as const;

export const ingestedItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(MENU_CATEGORIES).default("other"),
  /** Price for ONE item, in cedis, exactly as printed. */
  price_ghs: z.number().min(0).max(100000),
  notes: z.string().max(200).nullable().default(null),
});

export const ingestedVenueSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(VENUE_TYPES).default("restaurant"),
  price_band: z.enum(["budget", "mid", "premium"]).default("mid"),
  description: z.string().max(600).default(""),
  vibe_tags: z.array(z.string()).default([]),
  best_for: z.array(z.string()).default([]),
  dress_code: z.string().max(120).nullable().default(null),
  reservation_required: z.boolean().default(false),
  instagram_handle: z.string().max(120).nullable().default(null),
  phone: z.string().max(40).nullable().default(null),
  google_maps_url: z.string().max(600).nullable().default(null),
  lat: z.number().nullable().default(null),
  lng: z.number().nullable().default(null),
});

export const ingestResultSchema = z.object({
  venue: ingestedVenueSchema,
  items: z.array(ingestedItemSchema).default([]),
  /** Anything unreadable, ambiguous, or deliberately left blank. */
  warnings: z.array(z.string()).default([]),
  /** Currency actually seen on the menu — a guard against non-GHS prices. */
  detected_currency: z.string().nullable().default(null),
});

export type IngestResult = z.infer<typeof ingestResultSchema>;
export type IngestedItem = z.infer<typeof ingestedItemSchema>;

export interface IngestImage {
  /** image/jpeg | image/png | image/webp | image/gif */
  mediaType: string;
  /** Raw base64, no data: prefix. */
  data: string;
}

export interface IngestInput {
  venueName: string;
  areaName: string;
  venueType?: string;
  menuUrl?: string;
  images: IngestImage[];
  /** Anything the admin wants to tell the model — corrections, context. */
  notes?: string;
}

function buildPrompt(input: IngestInput): string {
  return `Extract a venue record and its menu for our Accra date-planning catalog.

What the admin has told us:
- Venue name: ${input.venueName}
- Area (Accra neighbourhood): ${input.areaName}
${input.venueType ? `- Venue type: ${input.venueType}` : ""}
${input.menuUrl ? `- Menu URL: ${input.menuUrl} (fetch it)` : ""}
${input.notes ? `- Admin notes: ${input.notes}` : ""}
${input.images.length ? `- ${input.images.length} menu image(s) are attached.` : ""}

Return ONLY a JSON object, no prose:

{
  "venue": {
    "name": string,
    "type": "restaurant"|"activity"|"lounge"|"outdoor"|"cafe"|"dessert",
    "price_band": "budget"|"mid"|"premium",
    "description": string,
    "vibe_tags": string[],
    "best_for": string[],
    "dress_code": string|null,
    "reservation_required": boolean,
    "instagram_handle": string|null,
    "phone": string|null,
    "google_maps_url": string|null,
    "lat": number|null,
    "lng": number|null
  },
  "items": [{ "name": string, "category": "starter"|"main"|"dessert"|"drink"|"other", "price_ghs": number, "notes": string|null }],
  "warnings": string[],
  "detected_currency": string|null
}

Rules, in order of importance:

1. NEVER invent a price. Every price_ghs must be one you actually read. If a
   price is smudged, cropped or missing, leave that item out and say so in
   warnings. These prices get summed against a real person's budget.
2. price_ghs is the price for ONE of the item, as printed. Do not convert, do
   not apply a service charge, do not round. If the menu prices in something
   other than cedis, put the currency in detected_currency and still report the
   printed numbers unconverted — a human will handle it.
3. Skip section headings, allergen keys and marketing copy. Items only.
4. If the same dish appears at several sizes, use the smallest priced portion
   and note the variants in that item's notes.
5. vibe_tags must come from exactly this set: romantic, calm, lively, fun,
   adventurous, chill, casual. best_for from: first_date, anniversary,
   date_night, friend_outing. Pick only what the evidence supports.
6. description is one or two plain sentences for a customer. No superlatives
   you cannot support.
7. phone in full international format (+233...). Only if you actually saw it.
   Leave contact fields null rather than guessing — a wrong number sends a
   customer to a stranger.
8. lat/lng only if you genuinely know them for this venue. Null otherwise.
9. price_band: budget if a typical main is under GHS 80, mid up to GHS 200,
   premium above. Base it on the items you read.`;
}

export interface IngestSuccess {
  ok: true;
  result: IngestResult;
}
export interface IngestFailure {
  ok: false;
  error: string;
}

export async function ingestMenu(
  input: IngestInput
): Promise<IngestSuccess | IngestFailure> {
  if (!input.images.length && !input.menuUrl) {
    return { ok: false, error: "Provide a menu URL or at least one menu image." };
  }

  const content: Anthropic.ContentBlockParam[] = [];

  // Images before the instruction: Claude reads images better when they
  // precede the question about them.
  for (const img of input.images) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType as never, data: img.data },
    });
  }
  content.push({ type: "text", text: buildPrompt(input) });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content }];

  let response: Anthropic.Message;
  let guard = 0;

  try {
    do {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: "high" },
        // Only offer the fetch tool when there is a URL to fetch; web_fetch
        // can only reach URLs already present in the conversation.
        ...(input.menuUrl
          ? {
              tools: [
                { type: "web_fetch_20260209" as const, name: "web_fetch", max_uses: 3 },
              ],
            }
          : {}),
        messages,
      });

      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
      }
      guard++;
    } while (response.stop_reason === "pause_turn" && guard < 4);
  } catch (e) {
    console.error("ingest call failed", e);
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Rate limited — try again shortly." };
    }
    if (e instanceof Anthropic.BadRequestError) {
      return {
        ok: false,
        error: "The images were rejected — check they are JPEG/PNG and not too large.",
      };
    }
    return { ok: false, error: "Could not reach the extraction service." };
  }

  if (response.stop_reason === "refusal") {
    return { ok: false, error: "The model declined to process this input." };
  }

  try {
    const parsed = ingestResultSchema.parse(
      parseModelJson<IngestResult>(textFromResponse(response))
    );
    return { ok: true, result: parsed };
  } catch (e) {
    console.error("ingest parse failed", e);
    return { ok: false, error: "The extraction came back in an unreadable shape." };
  }
}

/**
 * Suggested average spend per person, derived from the menu rather than
 * guessed: a typical main plus a typical drink. Deterministic, so an admin can
 * see where the number came from and correct it.
 */
export function suggestAvgCost(items: IngestedItem[]): number {
  const median = (xs: number[]): number => {
    if (!xs.length) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const mains = items.filter((i) => i.category === "main").map((i) => i.price_ghs);
  const drinks = items.filter((i) => i.category === "drink").map((i) => i.price_ghs);

  // No mains (an activity, a dessert bar) — fall back to the median of
  // everything so the figure still reflects real prices.
  const base = mains.length ? median(mains) : median(items.map((i) => i.price_ghs));
  return Math.round(base + median(drinks));
}
