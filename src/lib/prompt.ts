import type { Candidates } from "./matching";
import type { Itinerary, PlanInputs } from "./types";
import { pronounSet, aboutName, pronounForGender } from "./pronouns";
import { longDate, time12 } from "./format";

/**
 * Prompt construction for itinerary generation and single-stop swaps.
 * The TypeScript type embedded below is the contract the model must return.
 */

const ITINERARY_TYPE = `
type Itinerary = {
  title: string;                 // short, warm, no emojis, e.g. "Saturday on the coast"
  date: string;                  // echo the requested ISO date
  summary_route: string;         // e.g. "Osu → Labone → Cantonments"
  stops: Array<{
    venue_id: string;            // MUST be an id copied from the provided venues/events
    kind: "venue" | "event";
    name: string;                // exact venue/event name from the data
    area: string;                // area name from the data
    arrival_time: string;        // "5:30 PM" format, back-to-back with travel time
    duration_mins: number;
    label: string;               // uppercase stop label, e.g. "DINNER", "CANOPY WALK", "NIGHTCAP"
    what_to_do: string;          // one sentence of what to actually do there
    orders: Array<{ item: string; qty: number; price_ghs: number }>;
                                 // items MUST come from that venue's menu_items with real prices;
                                 // price_ghs is the line total (unit price × qty).
                                 // For activities use entry/rental items the same way. [] if nothing fits.
    est_cost_ghs: number; // sum of orders for the WHOLE party (event tickets × party size)
    why_this_fits: string;       // one warm sentence tying the stop to who this is for
    image_url: string | null;    // copy from the venue data
    google_maps_url: string | null;
    reservation_required: boolean;
  }>;
  hops: Array<{ from: string; to: string; mins: number; cost_ghs: number }>;
                                 // hops[i] connects stops[i] to stops[i+1]; use the provided per-hop estimates
  food_total_ghs: number;        // sum of stop costs
  transport_total_ghs: number;   // sum of hop costs
  est_total_ghs: number;         // food_total_ghs + transport_total_ghs — MUST be ≤ the budget
  budget_note: string | null;    // honest one-liner if the budget is tight (what to trim), else null
  personal_summary: string;      // ≤ 15 words: the details you designed around, e.g. "Seafood · quiet places near water · highlife records"
};`;

export function buildSystemPrompt(): string {
  return `You are aduro, a thoughtful date planner for Accra, Ghana. You design back-to-back date itineraries that feel personal, stay within budget, and only ever reference real venues.

HARD RULES — never break these:
1. Use ONLY the venues, menu items, and events provided in the user message. NEVER invent a venue, menu item, event, or price. Copy venue_id, names, prices and image URLs exactly as given.
2. Return ONLY valid JSON matching this TypeScript type — no markdown fences, no commentary, no trailing commas:
${ITINERARY_TYPE}
3. Build 2 to 4 stops, back-to-back: each arrival_time = previous arrival + previous duration + hop minutes. Vary the stop types — this is a date planner, not a restaurant list: mix food with an activity, event, dessert or lounge when the timing and budget allow.
4. est_total_ghs (food + transport) MUST NOT exceed the stated budget. If things are tight, choose cheaper items, drop to 2 stops, and say so honestly in budget_note with what was trimmed. Leave a little buffer when you can.
5. Respect the vibe: calm/chill → quiet venues; lively → energetic ones; romantic → intimate; adventurous → activities. Respect the occasion pacing (first dates get easy exits; anniversaries get the standout venue).
6. Weave the personalisation into WHICH stops you pick and into every why_this_fits line. Mention the specific detail (their favourite food, place style, artist/hobby). Honour "avoid" strictly — allergies and dislikes are non-negotiable (e.g. shellfish allergy means no shellfish dishes at all).
7. Use the per-hop transport estimates supplied in the data for hops between your chosen stops. Do not invent transport prices.
8. If an event in the data genuinely fits the date and vibe, prefer weaving it in — events make an outing memorable. For events, venue_id is the event id and est_cost_ghs covers one ticket per person in the party.
9. Times are for the requested date and window only. Do not schedule outdoor daylight activities after sunset (~6 PM in Accra).`;
}

/**
 * Who the outing is for. The shape changes with the party: a solo day has no
 * "them" to design around, and a group has several — writing the block one way
 * and hoping the model adapts produced plans addressed to a partner who did
 * not exist.
 */
function peopleBlock(inputs: PlanInputs): string {
  const p = inputs.partner;
  const size = inputs.partySize;

  if (size <= 1) {
    return `WHO THIS IS FOR: one person, on their own. This is a solo outing.
- Never imply company, a date or a companion. No tables for two, no shared plates framed as sharing.
- Solo-friendly matters: counter seating, somewhere comfortable to be alone, staff used to single covers.
- Favourite food or cuisine: ${p.food || "not given"}
- Their kind of place: ${p.place || "not given"}
- Something they are into: ${p.interests || "not given"}
- MUST AVOID: ${p.avoid || "nothing flagged"}`;
  }

  if (size > 2) {
    const named = inputs.companions.filter(Boolean);
    return `WHO THIS IS FOR: a group of ${size}${named.length ? ` — ${named.join(", ")}` : ""}.
- Order for ${size} people. Every quantity and every price must cover the whole group.
- Prefer places that can actually seat ${size}: shared tables, bookable spaces, activities that take a group.
- Do not write couple-ish copy. No "the two of you", no candlelit framing.
- Food or cuisine they enjoy: ${p.food || "not given"}
- Their kind of place: ${p.place || "not given"}
- Something they are into: ${p.interests || "not given"}
- MUST AVOID: ${p.avoid || "nothing flagged"}`;
  }

  const pronoun = pronounForGender(p.gender);
  const ps = pronounSet(pronoun);
  const who = aboutName(p.name, pronoun);
  return `WHO THIS IS FOR: two people. Refer to the other person as "${who}"${
    p.name ? ` — use the name "${p.name}"` : ""
  }, pronoun ${ps.they}/${ps.them}.
- Favourite food or cuisine: ${p.food || "not given"}
- ${ps.their} kind of place: ${p.place || "not given"}
- Something ${ps.they} love${pronoun === "they" ? "" : "s"}: ${p.interests || "not given"}
- MUST AVOID: ${p.avoid || "nothing flagged"}`;
}

export function buildGenerateUserMessage(
  inputs: PlanInputs,
  candidates: Candidates,
  hopTable: string
): string {
  const areaLabel = inputs.surpriseMe
    ? "Surprise them — pick a corner of the city that fits"
    : inputs.areaNames.join(" & ");

  return `PLAN REQUEST
- Date: ${longDate(inputs.date)} (${inputs.date})
- Start: ${time12(inputs.startTime)}, out for about ${inputs.hours} hours
- Areas: ${areaLabel}
- Party size: ${inputs.partySize} ${inputs.partySize === 1 ? "person" : "people"} — every order and price must cover all of them
- Total budget for the whole party, all-in (food + transport): GHS ${inputs.budget}
- Vibe: ${inputs.vibes.join(", ")}
- Occasion: ${inputs.occasion.replace(/_/g, " ")}

${peopleBlock(inputs)}

AVAILABLE VENUES (the ONLY venues you may use):
${JSON.stringify(
  candidates.venues.map((v) => ({
    venue_id: v.id,
    name: v.name,
    type: v.type,
    area: v.areas?.name ?? "",
    vibe_tags: v.vibe_tags,
    price_band: v.price_band,
    avg_cost_per_person_ghs: Number(v.avg_cost_per_person_ghs),
    description: v.description,
    best_for: v.best_for,
    reservation_required: v.reservation_required,
    dress_code: v.dress_code,
    image_url: v.image_url,
    google_maps_url: v.google_maps_url,
  })),
  null,
  1
)}

MENU ITEMS (real prices in GHS — the ONLY items you may order):
${JSON.stringify(
  candidates.menuItems.map((m) => ({
    venue_id: m.venue_id,
    item: m.name,
    category: m.category,
    price_ghs: Number(m.price_ghs),
    notes: m.notes,
  })),
  null,
  1
)}

EVENTS ON THAT DATE (optional, only if they fit):
${JSON.stringify(
  candidates.events.map((e) => ({
    event_id: e.id,
    title: e.title,
    at_venue_id: e.venue_id,
    area_id: e.area_id,
    start_time: e.start_time,
    ticket_ghs: e.cost_ghs === null ? 0 : Number(e.cost_ghs),
    category: e.category,
  })),
  null,
  1
)}

TRANSPORT ESTIMATES between venues (GHS, ride-hailing estimate — use these exact figures for hops):
${hopTable}

Return the Itinerary JSON now.`;
}

export function buildSwapUserMessage(
  inputs: PlanInputs,
  itinerary: Itinerary,
  stopIndex: number,
  candidates: Candidates,
  hopTable: string,
  budgetForStop: number
): string {
  const keptStops = itinerary.stops
    .map((s, i) =>
      i === stopIndex
        ? null
        : `- [KEEP] ${s.arrival_time} ${s.name} (${s.area}) — GHS ${s.est_cost_ghs}`
    )
    .filter(Boolean)
    .join("\n");

  const old = itinerary.stops[stopIndex];

  return `SWAP REQUEST — replace exactly ONE stop, keep the rest of the plan fixed.

Current plan (${longDate(inputs.date)}, budget GHS ${inputs.budget} all-in):
${keptStops}

REPLACE this stop: ${old.arrival_time} — ${old.name} (${old.area}), label "${old.label}", ~${old.duration_mins} mins.
The replacement must:
- arrive at the same time (${old.arrival_time}) and take roughly the same duration
- serve the same slot in the evening (same label spirit: ${old.label})
- cost at most GHS ${budgetForStop} for the whole party, INCLUDING what is ordered
- NOT be any venue already in the plan (including the one being replaced)
- still honour the partner details and the vibe

${peopleBlock(inputs)}
Vibe: ${inputs.vibes.join(", ")} · Occasion: ${inputs.occasion.replace(/_/g, " ")}

CANDIDATE VENUES (the ONLY options):
${JSON.stringify(
  candidates.venues.map((v) => ({
    venue_id: v.id,
    name: v.name,
    type: v.type,
    area: v.areas?.name ?? "",
    vibe_tags: v.vibe_tags,
    avg_cost_per_person_ghs: Number(v.avg_cost_per_person_ghs),
    description: v.description,
    reservation_required: v.reservation_required,
    image_url: v.image_url,
    google_maps_url: v.google_maps_url,
  })),
  null,
  1
)}

MENU ITEMS (real prices — the ONLY items you may order):
${JSON.stringify(
  candidates.menuItems.map((m) => ({
    venue_id: m.venue_id,
    item: m.name,
    price_ghs: Number(m.price_ghs),
  })),
  null,
  1
)}

TRANSPORT ESTIMATES (context only; totals are recomputed server-side):
${hopTable}

Return ONLY a JSON object for the single replacement stop, matching the "stops" array element type from the Itinerary contract (venue_id, kind, name, area, arrival_time, duration_mins, label, what_to_do, orders, est_cost_ghs, why_this_fits, image_url, google_maps_url, reservation_required). No markdown, no commentary.`;
}
