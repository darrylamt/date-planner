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
