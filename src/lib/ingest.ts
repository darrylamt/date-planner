import Anthropic from "@anthropic-ai/sdk";
import { anthropic, parseModelJson, textFromResponse } from "./anthropic";
import { ingestResultSchema, type IngestResult } from "./catalog";

// Re-exported so server code has one import site; browser code must import
// these from ./catalog directly, never from here — this module constructs the
// Anthropic client at load time.
export {
  MENU_CATEGORIES,
  VENUE_TYPES,
  PRICE_BANDS,
  ingestResultSchema,
  suggestAvgCost,
} from "./catalog";
export type { IngestedItem, IngestResult } from "./catalog";

/**
 * Menu ingestion — turns a menu photo or a menu URL into a structured venue
 * plus its menu items, ready to be written as a migration.
 *
 * The model reads; it never invents. Prices in this catalog are summed against
 * a real person's budget, so a hallucinated price is worse than a missing one.
 * Anything unreadable goes to `warnings` rather than being filled in.
 */
const MODEL = "claude-opus-5";

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
    "lng": number|null,
    "pricing_mode": "per_person"|"per_group"|"per_hour"|"per_hour_per_person",
    "unit_price_ghs": number|null
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
5. Not every venue sells food. A padel court's hourly rates, a bowling alley's
   per-game board, a laser tag session list, an entry fee at a door — these are
   price lists too, and every line on one is an item, category "other". Name
   the item exactly what is being charged for and put the unit in notes ("per
   hour", "per game", "per person, entry only") rather than trying to make it
   look like a dish. A venue with a single admission charge and nothing else
   to itemise still gets one item — "Entry" or "Admission" at that price — so
   its typical cost is never left for someone to type in from scratch.
5a. pricing_mode matters most for a venue that charges once for the whole
   group rather than once per person — a court, a lane, a table, a package.
   "GHS 240 an hour, up to 4 people" is per_hour with unit_price_ghs 240, not
   an item at 240 that four people would each be charged. Set pricing_mode and
   unit_price_ghs for that rate, and do NOT also create an item for the same
   charge — an item is for things billed per person (a drink, equipment hire,
   a shoe rental), the shared rate is not one of those. Leave pricing_mode
   "per_person" and unit_price_ghs null for every ordinary menu.
6. vibe_tags must come from exactly this set: romantic, calm, lively, fun,
   adventurous, chill, casual. best_for from: first_date, anniversary,
   date_night, friend_outing. Pick only what the evidence supports.
7. description is one or two plain sentences for a customer. No superlatives
   you cannot support.
8. phone in full international format (+233...). Only if you actually saw it.
   Leave contact fields null rather than guessing — a wrong number sends a
   customer to a stranger.
9. lat/lng only if you genuinely know them for this venue. Null otherwise.
10. price_band: budget under GHS 80 a head, mid up to GHS 200, premium above
    — judged against the typical single item or experience you read, whatever
    it is (a main course, a court hour, an entry fee), not specifically food.`;
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
  // Notes alone can carry the whole answer — "entry fee is GHS 30" needs no
  // photo — so only reject when there is truly nothing to extract from.
  if (!input.images.length && !input.menuUrl && !input.notes?.trim()) {
    return {
      ok: false,
      error: "Provide a menu URL, at least one menu image, or a note describing the price.",
    };
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
        max_tokens: 8000,
        // Reading a menu is transcription, not reasoning. `high` bought
        // nothing here and cost enough latency to blow a serverless budget.
        output_config: { effort: "medium" },
        // Only offer the fetch tool when there is a URL to fetch; web_fetch
        // can only reach URLs already present in the conversation.
        ...(input.menuUrl
          ? {
              tools: [
                { type: "web_fetch_20260209" as const, name: "web_fetch", max_uses: 2 },
              ],
            }
          : {}),
        messages,
      });

      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
      }
      guard++;
      // Each pause_turn is another full round trip. A site that blocks the
      // fetcher will pause every time, so the ceiling is low deliberately.
    } while (response.stop_reason === "pause_turn" && guard < 2);
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
