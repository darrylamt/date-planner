import { z } from "zod";

/**
 * Catalog vocabulary shared by server and client.
 *
 * Deliberately free of any server-only dependency. These constants are needed
 * by admin forms in the browser, and importing them from a module that also
 * constructs the Anthropic client drags the SDK into the client bundle, where
 * it throws on load for want of an API key.
 */

export const MENU_CATEGORIES = ["starter", "main", "dessert", "drink", "other"] as const;

export const VENUE_TYPES = [
  "restaurant",
  "activity",
  "lounge",
  "outdoor",
  "cafe",
  "dessert",
] as const;

export const PRICE_BANDS = ["budget", "mid", "premium"] as const;

/** Must stay in step with the vibe chips in the plan flow. */
export const VIBE_TAGS = [
  "romantic",
  "calm",
  "lively",
  "fun",
  "adventurous",
  "chill",
  "casual",
] as const;

export const BEST_FOR = [
  "first_date",
  "anniversary",
  "date_night",
  "friend_outing",
] as const;

export const ingestedItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(MENU_CATEGORIES).default("other"),
  /** Price for ONE item, in cedis, exactly as printed. */
  price_ghs: z.number().min(0).max(100000),
  notes: z.string().max(200).nullable().default(null),
});

export const PRICING_MODES = [
  "per_person",
  "per_group",
  "per_hour",
  "per_hour_per_person",
] as const;

export const ingestedVenueSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(VENUE_TYPES).default("restaurant"),
  price_band: z.enum(PRICE_BANDS).default("mid"),
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
  /**
   * How the venue charges. A court or a lane is priced per hour however many
   * people turn up, so folding that rate into a per-person average charges a
   * group of four roughly four times the real bill.
   */
  pricing_mode: z.enum(PRICING_MODES).default("per_person"),
  /** The charge pricing_mode refers to. Null unless the mode needs one. */
  unit_price_ghs: z.number().min(0).max(100000).nullable().default(null),
});

export const ingestResultSchema = z.object({
  venue: ingestedVenueSchema,
  items: z.array(ingestedItemSchema).default([]),
  /** Anything unreadable, ambiguous, or deliberately left blank. */
  warnings: z.array(z.string()).default([]),
  /** Currency actually seen on the menu — a guard against non-GHS prices. */
  detected_currency: z.string().nullable().default(null),
});

export type IngestedItem = z.infer<typeof ingestedItemSchema>;
export type IngestedVenue = z.infer<typeof ingestedVenueSchema>;
export type IngestResult = z.infer<typeof ingestResultSchema>;

/**
 * Suggested average spend per person, derived from the menu rather than
 * guessed: a typical main plus a typical drink. Deterministic, so an admin can
 * see where the number came from and correct it.
 */
export function suggestAvgCost(items: IngestedItem[], venue?: IngestedVenue): number {
  /*
   * A venue priced per hour or per group has no "average spend per person" to
   * derive from its items at all — its items (a court rate, an equipment
   * rental) are not per-person figures, and running the same median logic
   * over them the way a food menu is read would suggest a court's whole
   * hourly rate as what one person pays.
   */
  if (venue && venue.pricing_mode !== "per_person") return 0;

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
