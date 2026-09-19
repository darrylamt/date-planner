/**
 * Which dishes belong to which kitchen.
 *
 * ── the problem this solves ─────────────────────────────────────────────
 * A venue tagged `japanese` is not a venue where everything is Japanese.
 * Kula Bistro carries four cuisines across 195 items and Bold Restaurant
 * carries two across 281, so asking for Asian and being handed chicken wings
 * is not the planner picking the wrong venue -- it is the planner picking the
 * right venue and then ordering from the wrong half of its menu. Until now
 * dishes were chosen on price and course alone, with nothing anywhere that
 * knew a dish had a nationality.
 *
 * ── why a word list and not a column ────────────────────────────────────
 * The honest fix is a cuisine tag on each of the 7,101 menu rows, which is
 * real work and can be done later at ingest time. This is the cheap ninety
 * percent: the dishes people actually order out for have distinctive names,
 * and `bulgogi`, `tteokbokki` and `maki` say which kitchen they came from far
 * more reliably than any classifier would.
 *
 * It is used as a preference and never as a filter. A menu where nothing
 * matches still produces a meal, because the alternative -- refusing to feed
 * somebody because their dish names are unusual -- is worse than a slightly
 * generic order.
 *
 * ── what it deliberately will not catch ─────────────────────────────────
 * "Grilled chicken" at a Ghanaian-and-continental restaurant is genuinely
 * ambiguous and stays unmatched, which is correct: it scores neither for nor
 * against. Only positive evidence counts here.
 */

/**
 * Matched against a lower-cased item name.
 *
 * `continental` is deliberately absent: it is the catch-all 44 venues carry
 * and has no dish vocabulary of its own, so asking for it ranks venues and
 * leaves the ordering alone, which is the honest outcome.
 */
const DISHES: Record<string, string[]> = {
  ghanaian: [
    "jollof", "banku", "fufu", "waakye", "kenkey", "red red", "kelewele",
    "shito", "omo tuo", "tuo zaafi", "light soup", "groundnut soup",
    "palm nut", "palava", "ampesi", "gari", "tilapia", "khebab", "chichinga",
    "abolo", "angwamu", "nkatie", "okro", "kontomire", "yam chips", "wele",
  ],
  nigerian: ["egusi", "suya", "pounded yam", "ofada", "amala", "efo", "pepper soup", "moi moi", "jollof"],
  chinese: [
    "chow mein", "spring roll", "sweet and sour", "szechuan", "sichuan",
    "wonton", "kung pao", "dim sum", "chop suey", "hoisin", "mapo",
    "peking", "fried rice", "noodle",
  ],
  japanese: [
    "sushi", "sashimi", "ramen", "teriyaki", "tempura", "maki", "nigiri",
    "udon", "gyoza", "katsu", "miso", "edamame", "donburi", "yakitori",
    "wasabi", "bento", "izakaya",
  ],
  korean: [
    "kimchi", "bulgogi", "bibimbap", "japchae", "jabchae", "tteok", "ddeok",
    "mandu", "jjigae", "kimbap", "gochujang", "samgyeopsal", "galbi",
    "bokeumbab", "deopbap", "pajeon", "soondubu",
  ],
  asian: ["noodle", "stir fry", "stir-fry", "spring roll", "satay", "pad thai", "curry", "dumpling", "wok", "bao"],
  italian: [
    "pasta", "pizza", "risotto", "lasagne", "lasagna", "spaghetti", "penne",
    "carbonara", "gnocchi", "bruschetta", "margherita", "pesto", "calzone",
    "tiramisu", "ravioli", "fettuccine", "arrabbiata", "focaccia",
  ],
  pizza: ["pizza", "margherita", "calzone", "pepperoni"],
  lebanese: ["shawarma", "hummus", "falafel", "tabbouleh", "kofta", "kebab", "baba ganoush", "fattoush", "manakish", "labneh"],
  mediterranean: ["hummus", "falafel", "kofta", "kebab", "tzatziki", "moussaka", "souvlaki", "pita", "halloumi", "tagine"],
  indian: ["curry", "tikka", "masala", "naan", "biryani", "paneer", "samosa", "tandoori", "korma", "dal", "vindaloo", "roti"],
  mexican: ["taco", "burrito", "quesadilla", "nacho", "enchilada", "guacamole", "fajita", "churro", "salsa"],
  caribbean: ["jerk", "plantain", "curry goat", "oxtail", "ackee", "roti", "callaloo", "escovitch"],
  jamaican: ["jerk", "ackee", "oxtail", "curry goat", "escovitch", "festival", "bammy"],
  french: ["croissant", "baguette", "crepe", "crêpe", "quiche", "ratatouille", "confit", "brie", "eclair", "éclair", "macaron", "pain au", "sourdough", "bourguignon", "tartare"],
  peruvian: ["ceviche", "lomo saltado", "aji", "causa", "anticucho", "pisco"],
  turkish: ["kebab", "pide", "baklava", "meze", "lahmacun", "borek", "doner", "döner"],
  seafood: ["prawn", "shrimp", "lobster", "calamari", "octopus", "salmon", "tuna", "snapper", "tilapia", "crab", "oyster"],
  grill: ["grilled", "grill", "bbq", "barbecue", "skewer", "ribs", "steak", "chop"],
  bakery: ["croissant", "muffin", "scone", "brownie", "cookie", "cake", "pastry", "danish", "donut", "doughnut", "sourdough", "bagel"],
  american: ["burger", "wings", "fries", "hot dog", "mac and cheese", "milkshake", "bbq", "sub", "club sandwich"],
  "fast food": ["burger", "fries", "wings", "hot dog", "nugget", "shawarma", "sub", "wrap"],
};

/**
 * Does this dish read as belonging to one of these kitchens?
 *
 * Substring rather than word matching, because these names arrive inside
 * longer ones -- "Kimchi Bokeumbab (Kimchi-beef Fried Rice)" has to match
 * korean on three separate counts, and a word-boundary rule would miss
 * "Jabchae" inside "Gochu Jabchae".
 */
export function dishMatchesCuisine(
  name: string,
  _notes: string | null | undefined,
  cuisines: string[]
): boolean {
  if (!cuisines.length) return false;
  /*
   * The name only, deliberately, though the notes are right there and 89% of
   * rows have them.
   *
   * A note describes how a dish is served, and the side is not the dish:
   * "Omotuon with Groundnut Soup" has a note mentioning fries, which put a
   * Ghanaian classic into an American order. A dish's nationality lives in
   * what it is called, and matching the description instead of the name
   * reliably fetches the accompaniment's cuisine rather than the meal's.
   */
  const hay = name.toLowerCase();
  for (const c of cuisines) {
    const words = DISHES[c.trim().toLowerCase()];
    if (!words) continue;
    if (words.some((w) => hay.includes(w))) return true;
  }
  return false;
}

/** The cuisines this file can actually recognise dishes for. */
export function knownCuisines(): string[] {
  return Object.keys(DISHES);
}
