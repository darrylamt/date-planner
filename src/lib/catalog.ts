import { z } from "zod";

/**
 * Catalog vocabulary shared by server and client.
 *
 * Deliberately free of any server-only dependency. These constants are needed
 * by admin forms in the browser, and importing them from a module that also
 * constructs the Anthropic client drags the SDK into the client bundle, where
 * it throws on load for want of an API key.
 */

/**
 * "activity" is a line on a price list rather than a course: a go-kart, a game
 * of bowling, twelve minutes of laser tag. It is not "other", because the
 * planner already uses "other" as the bucket for a flat entry fee.
 */
export const MENU_CATEGORIES = [
  "starter",
  "main",
  "dessert",
  "drink",
  "activity",
  "other",
] as const;

export const VENUE_TYPES = [
  "restaurant",
  "activity",
  "lounge",
  "outdoor",
  "cafe",
  "dessert",
] as const;

export const PRICE_BANDS = ["budget", "mid", "premium"] as const;

/**
 * The tags a venue row may carry.
 *
 * This is the vocabulary the catalogue is written in. It is deliberately not
 * the same list as the chips in the plan flow, which are the words a person
 * uses: "Club hopping" is a thing to do on a Friday, not a property of a room.
 * VIBE_CHIP_TAGS below is the translation between the two, and it is the only
 * place that translation is allowed to happen.
 */
export const VENUE_VIBE_TAGS = [
  "romantic",
  "calm",
  "lively",
  "fun",
  "adventurous",
  "chill",
  "casual",
  "scenic",
  "upscale",
  // Added so the eight plan-flow chips that matched nothing have something in
  // the catalogue to match. Before this, picking "Beach" searched every venue
  // for a literal `beach` tag, no row had ever carried one, and the vibe was
  // silently dropped from the ranking.
  "beach",
  "outdoorsy",
  "sporty",
  "artsy",
  "foodie",
  "dancing",
] as const;

export type VenueVibeTag = (typeof VENUE_VIBE_TAGS)[number];

/**
 * Plan-flow chip (lowercased) to the venue tags that satisfy it.
 *
 * There were two of these, one in matching.ts and a different one in
 * planner.ts, and they disagreed. matching.ts is the half that actually
 * chooses which venues the model gets to see, and it knew about six of the
 * fourteen chips; the other eight fell through to a literal tag lookup that
 * could never hit. So a request for Beach, Dancing, Club hopping, Sporty,
 * Outdoorsy, Picnic, Artsy or Foodie was ranked as though no vibe had been
 * asked for at all. One map, imported by both, is the fix.
 *
 * Every chip in planConstants.VIBES must appear here, and every tag named must
 * appear in VENUE_VIBE_TAGS. The test for this pair is whether a chip on
 * screen can ever change the plan you get.
 */
export const VIBE_CHIP_TAGS: Record<string, VenueVibeTag[]> = {
  romantic: ["romantic"],
  calm: ["calm", "chill"],
  lively: ["lively"],
  fun: ["fun"],
  adventurous: ["adventurous", "sporty"],
  chill: ["chill", "calm", "casual"],
  beach: ["beach", "scenic", "outdoorsy"],
  dancing: ["dancing", "lively"],
  "club hopping": ["dancing", "lively"],
  sporty: ["sporty", "adventurous"],
  outdoorsy: ["outdoorsy", "scenic", "adventurous"],
  // No `picnic` tag: it would apply to about three rows. The things that make
  // somewhere good for a picnic are already sayable.
  picnic: ["outdoorsy", "scenic", "calm"],
  artsy: ["artsy"],
  foodie: ["foodie", "upscale"],
};

/** Chip labels to venue tags, for the one filter both halves of the planner run. */
export function expandVibes(vibes: string[]): string[] {
  const out = new Set<string>();
  for (const v of vibes) {
    const key = v.toLowerCase();
    for (const t of VIBE_CHIP_TAGS[key] ?? [key]) out.add(t);
  }
  return Array.from(out);
}

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
  /** Currency actually seen on the menu, a guard against non-GHS prices. */
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
   * derive from its items at all, its items (a court rate, an equipment
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

  // No mains (an activity, a dessert bar), fall back to the median of
  // everything so the figure still reflects real prices.
  const base = mains.length ? median(mains) : median(items.map((i) => i.price_ghs));
  return Math.round(base + median(drinks));
}


/**
 * Turn what a human wrote into one of our five categories.
 *
 * The enum is lower case and a spreadsheet is not. A menu exported by a person
 * says "Main", "Mains", "Starters", "Drinks", and passing any of those
 * straight to Postgres fails the whole row on `invalid input value for enum
 * menu_category`, which is a true error message that tells nobody what to do.
 *
 * Plurals and the obvious synonyms are folded in, because "Appetizer" and
 * "Starter" are the same section of the same menu, and rejecting a hundred
 * rows over that is not a standard worth holding.
 */
/**
 * Section headings as menus actually write them, mapped to the five we store.
 *
 * The exact table is for headings that name a course. The keyword pass below
 * is for the far commoner case: a menu names its sections after the food.
 * Tea Baa's card has eighteen headings and only one of them ("Main") is a
 * course; the rest are Burgers, Tacos, Sliders, Waters, House Wines.
 */
const CATEGORY_SYNONYMS: Record<string, (typeof MENU_CATEGORIES)[number]> = {
  starter: "starter",
  starters: "starter",
  appetizer: "starter",
  appetizers: "starter",
  appetiser: "starter",
  small: "starter",
  smallplates: "starter",
  sides: "starter",
  side: "starter",

  main: "main",
  mains: "main",
  maincourse: "main",
  maincourses: "main",
  entree: "main",
  entrees: "main",
  dish: "main",
  dishes: "main",
  food: "main",

  dessert: "dessert",
  desserts: "dessert",
  sweet: "dessert",
  sweets: "dessert",
  pudding: "dessert",

  drink: "drink",
  drinks: "drink",
  beverage: "drink",
  beverages: "drink",
  cocktail: "drink",
  cocktails: "drink",
  wine: "drink",
  beer: "drink",
  softdrink: "drink",
  softdrinks: "drink",

  activity: "activity",
  activities: "activity",
  game: "activity",
  games: "activity",
  arcade: "activity",
  ride: "activity",
  rides: "activity",
  experience: "activity",
  experiences: "activity",
  session: "activity",
  sessions: "activity",
  ticket: "activity",
  tickets: "activity",
  entry: "activity",
  admission: "activity",

  other: "other",
  extra: "other",
  extras: "other",
  misc: "other",
};

/**
 * Words that place a heading, tried in this order.
 *
 * Order is the whole design. "Sweet Wine" is a drink, not a dessert, so drink
 * words are tried before sweet ones; "House Wines" is a drink and not a main,
 * so "house" is deliberately absent from the main list. Each rule is checked
 * against whole words rather than substrings, because "Starters" contains the
 * letters of "tart" and would otherwise become a dessert.
 */
const CATEGORY_KEYWORDS: [(typeof MENU_CATEGORIES)[number], string[]][] = [
  [
    "drink",
    [
      "drink", "beverage", "bar", "cocktail", "mocktail", "wine", "champagne",
      "prosecco", "sparkling", "bubbly", "beer", "cider", "lager", "stout",
      "ale", "spirit", "liquor", "whisky", "whiskey", "bourbon", "vodka",
      "gin", "rum", "tequila", "brandy", "liqueur", "shot", "water", "juice",
      "soda", "smoothie", "tea", "coffee", "latte", "espresso", "cappuccino",
      "aperitif",
    ],
  ],
  [
    "dessert",
    [
      "dessert", "sweet", "pudding", "cake", "pastry", "gelato", "sorbet",
      "brownie", "cheesecake", "waffle", "crepe", "donut", "doughnut",
      "patisserie", "sundae", "parfait",
    ],
  ],
  [
    "starter",
    [
      "starter", "appetizer", "appetiser", "small", "plate", "side", "snack",
      "bite", "nibble", "sharing", "tapas", "dip", "soup", "salad", "wing",
      "finger",
    ],
  ],
  [
    /*
     * Before food, because an arcade sheet says "Racers" and "Shooters" and a
     * menu never does. "bowling" and "golf" would otherwise never be reached.
     */
    "activity",
    [
      "activity", "game", "arcade", "ride", "experience", "session", "ticket",
      "entry", "admission", "bowling", "golf", "karting", "kart", "laser",
      "tag", "vr", "simulator", "trampoline", "inflatable", "karaoke",
      "racer", "shooter", "crane", "archery", "paintball", "escape",
      // Headings off the Game It Up poster: Sporty, Win Something, Racers,
      // Physical Test, Shooters, Experiences, Rhythm/Dance.
      "sport", "sporty", "win", "prize", "physical", "rhythm", "dance",
      "racing", "shooting", "bumper", "court", "lane", "round",
    ],
  ],
  [
    "main",
    [
      "main", "entree", "course", "burger", "taco", "slider", "sandwich",
      "wrap", "pizza", "pasta", "noodle", "rice", "grill", "grilled", "steak",
      "chicken", "beef", "pork", "lamb", "fish", "seafood", "prawn", "meat",
      "bowl", "platter", "stir", "fry", "kebab", "curry", "dish", "food",
    ],
  ],
];

/**
 * A heading from someone's spreadsheet, turned into one of our five.
 *
 * Returns null when nothing matches, which the importer reports per row. It
 * guesses rather than refusing, because refusing meant a hundred-line menu
 * imported nothing at all, but it never guesses silently: the importer prints
 * every heading it mapped so a wrong reading is visible rather than buried in
 * the data.
 */
export function normaliseCategory(
  raw: string | null | undefined
): (typeof MENU_CATEGORIES)[number] | null {
  const text = (raw ?? "").trim().toLowerCase();
  if (!text) return "other";

  const exact = CATEGORY_SYNONYMS[text.replace(/[\s_-]/g, "")];
  if (exact) return exact;

  /*
   * Words, plus a crude singular, so "Waters" finds "water" and "Teas" finds
   * "tea" without a stemmer.
   */
  const words = new Set<string>();
  for (const w of text.split(/[^a-z]+/).filter(Boolean)) {
    words.add(w);
    if (w.endsWith("ies") && w.length > 4) words.add(`${w.slice(0, -3)}y`);
    else if (w.endsWith("es") && w.length > 3) words.add(w.slice(0, -2));
    if (w.endsWith("s") && w.length > 2) words.add(w.slice(0, -1));
  }

  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => words.has(k))) return category;
  }
  return null;
}
