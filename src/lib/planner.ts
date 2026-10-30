import type { Candidates } from "./matching";
import { chargesOn, chargesTotal } from "./budget";
import { dishMatchesCuisine } from "./cuisineDishes";
import { MENU_ONLY_TYPES, freeToVisit, isDriving } from "./budget";
import { expandVibes, loungeFloor } from "./catalog";
import { isOpenAt, isOpenThroughout, parsePeriods, weekdayOf } from "./hours";
import { genreFits } from "./movies";
import { insightScore, isSignature, noiseWanted } from "./insights";
import { pullScore } from "./pull";
import { dishTaste } from "./taste";
import { estimateHop, haversineKm } from "./transport";
import { planEventNight } from "./eventNight";
import { isBase, needsBase, pickBase } from "./accompaniments";
import { byTheGlass } from "./bottles";
import { schedulesDuring } from "./schedules";
import { venueAt, vibeTagsAt } from "./dayEnergy";
import {
  focusesOf,
  WELLNESS_TREATMENT_MIN_GHS,
  treatmentMatches,
  wellnessAllowed,
  wellnessKindsOf,
  type WellnessKind,
} from "./planConstants";
import type {
  EventRow,
  Formality,
  PriceConfidence,
  ItineraryOrder,
  MenuItem,
  PlanCuisine,
  PlanFocus,
  PlanInputs,
  PriceBand,
  Venue,
  VenueSchedule,
  VenueType, NarrowFocus, StopCharge, Diet } from "./types";

/**
 * Deterministic itinerary planning.
 *
 * The model used to choose the venues, choose the orders and add up the bill,
 * and the budget was enforced by rejecting the answer and asking again. That
 * cost a full retry whenever the arithmetic drifted, and "usually inside the
 * budget" is a weak promise for the one number a user actually gave us.
 *
 * Selection and money now live here. The model is left with the part it is
 * genuinely better at, writing why a place suits someone, and receives only
 * the handful of venues that were chosen rather than the whole catalogue.
 * Smaller prompt, no retries, and a budget that is exact by construction.
 */

/** What a slot in the evening is for. Roles map onto venue types. */
type Role = "meal" | "cafe" | "activity" | "lounge" | "dessert" | "wellness";

const ROLE_TYPES: Record<Role, VenueType[]> = {
  meal: ["restaurant"],
  cafe: ["cafe"],
  activity: ["activity", "outdoor"],
  lounge: ["lounge"],
  dessert: ["dessert"],
  // Never "activity": a spa is only ever the stop somebody asked for.
  wellness: ["wellness"],
};

/**
 * When a slot's own kind has run out, what stands in for it, nearest first.
 * Kinds not listed come after these. A bar is last for every slot that is not
 * a bar, because a bar is the one substitute that changes what the stop is.
 */
const FALLBACK_TYPES: Record<Role, VenueType[]> = {
  // Never a dessert shop: fitting a budget made waffles the "dinner" of a date night (27 Oct 2026).
  meal: ["cafe", "lounge"],
  cafe: ["dessert", "restaurant", "lounge"],
  dessert: ["cafe", "restaurant", "lounge"],
  // After dinner a stand-in is dessert or a drink, not a second restaurant (27 Oct 2026).
  activity: ["dessert", "lounge", "cafe", "restaurant"],
  lounge: ["restaurant", "cafe", "dessert"],
  wellness: [],
};

/** Typical time spent, before travel. */
const ROLE_MINUTES: Record<Role, number> = {
  meal: 80,
  cafe: 60,
  activity: 90,
  lounge: 75,
  dessert: 45,
  wellness: 90,
};

/** Used when a slot falls back to a venue of another type. */
const TYPE_LABEL: Record<string, string> = {
  restaurant: "A TABLE",
  cafe: "COFFEE",
  lounge: "DRINKS",
  dessert: "DESSERT",
  activity: "SOMETHING TO DO",
  outdoor: "OUTDOORS",
  wellness: "SPA",
};

const ROLE_LABEL: Record<Role, string> = {
  meal: "DINNER",
  cafe: "COFFEE",
  activity: "SOMETHING TO DO",
  lounge: "DRINKS",
  dessert: "DESSERT",
  wellness: "SPA",
};

/**
 * The shape of the outing, by when it starts.
 *
 * A plan beginning at 10am is not a shorter version of one beginning at 7pm,
 * so the sequence is chosen from the clock rather than scaled.
 */
/**
 * The kind of place a business meeting asked to be held in.
 *
 * A pathway that offers "a cafe, a lounge, or over a meal" and then hands the
 * planner nothing has offered a decoration. This is the one occasion where the
 * venue's kind is stated outright rather than inferred from a vibe, so it
 * overrides the hour: a meeting at eight in the evening in a cafe is a cafe,
 * not the lounge the clock would otherwise reach for.
 */
const MEETING_ROLES: Record<string, Role> = {
  cafe: "cafe",
  lounge: "lounge",
  restaurant: "meal",
};

export function meetingRole(inputs: Pick<PlanInputs, "occasion" | "occasionDetail">): Role | null {
  if (inputs.occasion !== "business_meeting") return null;
  return MEETING_ROLES[inputs.occasionDetail?.setting ?? "cafe"] ?? "cafe";
}

/**
 * The venue types a meeting's chosen setting needs in the shortlist.
 *
 * Candidate selection has to reserve these for exactly the reason focus does.
 * Scoring by vibe alone fills the list with restaurants -- there are 117 of
 * them and 23 cafes -- so a meeting asked to be held in a cafe came back with
 * two cafes shortlisted, neither of them the best option, and the single stop
 * fell back to a restaurant. Asking for a cafe and being sent to a restaurant
 * is the choice not meaning anything.
 */
export function meetingVenueTypes(
  inputs: Pick<PlanInputs, "occasion" | "occasionDetail">
): VenueType[] {
  const role = meetingRole(inputs);
  return role ? ROLE_TYPES[role] : [];
}

/**
 * Put the spa first, when one was asked for.
 *
 * First because a treatment is the thing to be on time for and the rest of
 * the evening can move around it, and because nobody wants to be on a massage
 * table straight after dinner. It takes the place of the last stop rather than
 * adding one, so a request for two places is still two places.
 *
 * Never for a business meeting, whose single stop is the one it named.
 */
function withWellness(
  roles: Role[],
  inputs: Pick<PlanInputs, "wellness" | "partySize" | "occasion" | "occasionDetail">
): Role[] {
  if (!inputs.wellness || !wellnessAllowed(inputs) || meetingRole(inputs)) return roles;
  if (roles.includes("wellness")) return roles;
  return ["wellness" as Role, ...roles].slice(0, Math.max(roles.length, 1));
}

export { focusesOf };

const asFocuses = (f: PlanFocus | NarrowFocus[]): NarrowFocus[] =>
  Array.isArray(f) ? f : f === "everything" ? [] : [f];

function roleSequence(
  startHour: number,
  stopCount: number,
  focus: PlanFocus | NarrowFocus[],
  vibes: string[] = [],
  /** Set when the occasion names the kind of place itself. Beats everything. */
  forced: Role | null = null
): Role[] {
  if (forced) return Array.from({ length: stopCount }, () => forced);

  /*
   * A narrowed focus overrides the time of day entirely. Someone asking for
   * drinks wants a second bar, not dinner at the sensible hour for it, and
   * cycling the focus roles is what turns one request into a crawl.
   */
  const narrowed = asFocuses(focus);
  if (narrowed.length) {
    /*
     * Two focuses take turns, each cycling its own roles: food and drinks
     * over four stops is a meal, a bar, dessert, a bar. One focus is the old
     * behaviour exactly.
     */
    const n = narrowed.length;
    // Asked for mostly food or mostly drinks: several of them is the point, so no one-meal rule (owner, 27 Oct 2026).
    return (withLoungeFloor(
      Array.from({ length: stopCount }, (_, i) => {
        const roles = FOCUS_ROLES[narrowed[i % n]];
        return roles[Math.floor(i / n) % roles.length];
      }),
      loungeFloor(vibes)
    ));
  }

  let base: Role[];
  /*
   * Six long, and cycled if a request ever runs past them.
   *
   * These were four, and the sequence was taken with slice, so asking for five
   * places returned four roles and the planner built four stops without ever
   * reporting that it had not done what was asked. Somebody chose five and got
   * four, with no fallback and no message, because the list simply ran out.
   */
  if (startHour < 11) base = ["cafe", "activity", "meal", "dessert", "activity", "lounge"];
  else if (startHour < 15) base = ["meal", "activity", "dessert", "lounge", "activity", "cafe"];
  else if (startHour < 17) base = ["activity", "meal", "lounge", "dessert", "lounge", "activity"];
  else base = ["meal", "activity", "lounge", "dessert", "lounge", "activity"];

  return oneMeal(
    withLoungeFloor(
      Array.from({ length: stopCount }, (_, i) => base[i % base.length]),
      loungeFloor(vibes)
    )
  );
}

/**
 * One full meal per outing, unless it is a long day of five stops or more.
 *
 * A food plan cycled meal, dessert, cafe, meal, and an afternoon put eggs at
 * half past three and dinner an hour later. A second meal becomes the next
 * thing after a meal instead: dessert, or a drink.
 */
function oneMeal(seq: Role[]): Role[] {
  if (seq.length >= 5) return seq;
  let seen = false;
  return seq.map((r, i) => {
    if (r !== "meal") return r;
    if (!seen) {
      seen = true;
      return r;
    }
    return seq[i - 1] === "dessert" ? "lounge" : "dessert";
  });
}

/**
 * Make the sequence carry the bars a vibe asked for.
 *
 * Converted from the end, because an evening is built front to back: dinner
 * first, then somewhere to go afterwards. Taking the dessert slot for a second
 * bar is what somebody choosing "club hopping" meant; taking the meal slot is
 * not, unless the evening is short enough that there is nowhere else for the
 * bars to go, in which case two bars is precisely and only what they asked
 * for.
 */
function withLoungeFloor(seq: Role[], floor: number): Role[] {
  if (floor <= 0) return seq;

  let need = floor - seq.filter((r) => r === "lounge").length;
  if (need <= 0) return seq;

  const out = [...seq];
  for (let i = out.length - 1; i >= 0 && need > 0; i--) {
    if (out[i] !== "lounge") {
      out[i] = "lounge";
      need--;
    }
  }
  return out;
}

/** What each narrowed focus is made of, cycled to fill the stops asked for. */
const FOCUS_ROLES: Record<Exclude<PlanFocus, "everything">, Role[]> = {
  food: ["meal", "dessert", "cafe"],
  drinks: ["lounge"],
  activities: ["activity"],
};

/**
 * The venue types a narrowed focus can actually be built from.
 *
 * Candidate selection needs this too: scoring by vibe alone can fill all
 * fourteen slots with restaurants, and a "just drinks" request then reaches
 * the planner with no bar in it at all.
 */
export function focusVenueTypes(focus: PlanFocus | NarrowFocus[]): VenueType[] {
  const types = new Set<VenueType>();
  for (const f of asFocuses(focus)) FOCUS_ROLES[f].forEach((role) => ROLE_TYPES[role].forEach((t) => types.add(t)));
  return [...types];
}

/** Two stops in a short window, four only when there is genuinely time. */
export function stopCountFor(
  hours: number,
  focus: PlanFocus | NarrowFocus[] = "everything",
  vibes: string[] = [],
  /** What they asked for, when they were asked. Beats every inference here. */
  stops?: number
): number {
  /*
   * A stated answer is not a starting point to be reasoned about. Somebody who
   * says two places has told us the shape of their evening, and deriving four
   * from the clock instead is the app overruling them with arithmetic.
   */
  if (stops && stops >= 1) return stops;

  /*
   * A crawl is the shape where more stops is the point. Three bars is a night
   * out and two is a drink, so a drinks-only or activity-only evening reaches
   * further than a mixed one given the same hours. The budget still decides
   * whether they are affordable: this only sets what to attempt.
   *
   * "Club hopping" is the same shape asked for a different way, and it arrives
   * as a vibe rather than a focus, so it has to be read here too or the chip
   * reaches the planner with nowhere to put the bars it wants.
   */
  const narrowed = asFocuses(focus);
  const crawl =
    (narrowed.length > 0 && narrowed.every((f) => f === "drinks" || f === "activities")) || loungeFloor(vibes) >= 2;

  /*
   * Fewer places, each better. Five stops split the budget five ways, and
   * the owner's verdict on such a plan (27 Oct 2026) was that two or three
   * good ones beat five thin ones: a proper meal somewhere special, then
   * one more place, not a crawl of snacks. Crawls keep their length.
   */
  if (crawl) {
    if (hours <= 2) return 2;
    if (hours <= 4) return 4;
    return hours <= 6 ? 5 : 6;
  }
  if (hours <= 4) return 2;
  return hours <= 7 ? 3 : 4;
}

/*
 * The chip-to-tag map used to be duplicated here, and it had drifted: this
 * copy knew about beach, dancing, sporty, picnic, foodie and artsy while the
 * one in matching.ts did not, so the shortlist and the itinerary disagreed
 * about what the user had asked for. Both read catalog.ts now.
 */

const BAND_RANK: Record<PriceBand, number> = { budget: 0, mid: 1, premium: 2 };

/**
 * How well a venue matches the register asked for.
 *
 * Deliberately a preference and not a filter: someone asking for somewhere
 * fancy on a modest budget should still get the smartest places that fit,
 * rather than no plan at all.
 */
function formalityScore(v: Venue, formality: Formality): number {
  if (formality === "either") return 0;

  const rank = BAND_RANK[v.price_band] ?? 1;
  const dressy = v.dress_code ? 1 : 0;
  const upscale = v.vibe_tags.includes("upscale") ? 1 : 0;
  const casual = v.vibe_tags.includes("casual") ? 1 : 0;

  return formality === "fancy"
    ? rank * 2 + dressy * 2 + upscale * 3 - casual * 2
    : (2 - rank) * 2 + casual * 3 - dressy * 2 - upscale * 2;
}

/**
 * How much looks matter for this occasion.
 *
 * An anniversary at somewhere plain is a worse evening than the same money
 * spent somewhere beautiful, while a group of friends bowling care about the
 * bowling. Weighting rather than filtering, so a plain venue that fits
 * everything else can still be chosen when nothing lovelier does.
 */
const LOOKS_WEIGHT: Record<string, number> = {
  anniversary: 2.5,
  first_date: 2,
  date_night: 2,
  celebration: 1.5,
  graduation: 1.5,
  birthday: 1,
  solo_day: 1,
  friend_outing: 0.5,
};

/**
 * How much a weekly fixture is worth to this occasion.
 *
 * Karaoke on a Thursday is the reason to pick one bar over another if you came
 * out to be somewhere lively, and the reason to pick the other one if you came
 * to hear each other speak. So it is weighted by why they are out rather than
 * treated as universally good news.
 *
 * Never negative, and never a filter. A first date at the only decent
 * restaurant in the area should not be refused because a band happens to be
 * on, and the card names what is on, so anyone who wanted quiet can see it and
 * swap. Scoring it down would hide a real fact to protect a guess about taste.
 */
const FIXTURE_WEIGHT: Record<string, number> = {
  friend_outing: 3,
  birthday: 3,
  celebration: 3,
  graduation: 2.5,
  date_night: 1.5,
  solo_day: 1,
  first_date: 0,
  anniversary: 0,
};

/*
 * A cocktail over a shot.
 *
 * Drinks are dealt from a window around the tier's price, and a shot is the
 * cheapest line on most bar lists, so plans kept sending people out for
 * shots: the owner's complaint. A cocktail counts as one and a half
 * recommendations and a shot as minus three, so a cocktail near the price
 * takes a shot's place and is dealt first. Read from the name and the notes
 * (the importer writes "Single shot" for spirits by the glass).
 */
const COCKTAIL = /cocktail|mojito|margarita|martini|daiquiri|spritz|negroni|old fashioned|pi[nñ]a colada|sangria|long island|mai tai|cosmopolitan|caipirinha|\bsour\b|\bmule\b|colada|paloma|bellini|mimosa|sex on the beach|tequila sunrise|blue lagoon|zombie|\bpunch\b/i;
const SHOT = /\bshots?\b|\bshooters?\b|single shot|\btots?\b|jager ?bomb|j[aä]germeister/i;
/** Breakfast on a menu, left off a meal from EVENING (see orderFrom). */
const BREAKFAST = /\b(omelet(te)?s?|scrambled?|scramble|eggs? benedict|benedict|pancakes?|french toast|porridge|granola|croissants?|breakfast|full english|bagels?|oats|oatmeal|cereal|waffles?|crepes?|egg (and|&) |eggs on toast|avocado toast)\b/i;
/**
 * Plain water, the one drink nobody goes out for. Coconut water and
 * watermelon juice are drinks; "Sparkling Water (small)" as the whole order
 * at a tea room was not (owner, 27 Oct 2026).
 */
const PLAIN_WATER = /^(?!.*(coconut|melon|juice|tonic|lemonade)).*(water|club soda|soda water)/i;
/** Coffee and tea, left off the drinks from LATE_NIGHT. */
const HOT_DRINK = /\b(coffee|cappuc+ino|latte|espresso|americano|macchiato|mocha|flat white|cortado|hot choc(olate)?|tea|chai)\b/i;
const EVENING = 17 * 60;
const LATE_NIGHT = 21 * 60;
/**
 * When breakfast is over: noon on a weekday, half past one at the weekend
 * for brunch. It was five, and a Sunday anniversary was served an omelette
 * at half past three and scrambled eggs again an hour later (27 Oct 2026).
 */
const breakfastEnds = (weekday: number | null) => (weekday === 0 || weekday === 6 ? 13 * 60 + 30 : 12 * 60);
/*
 * What a dish is: Gemini's reading where there is one (0096,
 * menuUnderstand.ts), the old name rules where there is not yet.
 */
const isBreakfastDish = (m: MenuItem) =>
  m.meal_time ? m.meal_time !== "anytime" : BREAKFAST.test(`${m.name} ${m.notes ?? ""}`);
// The name too: Gemini files "Soda Water" under soda, and it is still a glass of water.
const isWater = (m: MenuItem) => m.drink_kind === "still_water" || m.drink_kind === "sparkling_water" || PLAIN_WATER.test(m.name);
const isShot = (m: MenuItem) => (m.drink_kind ? m.drink_kind === "shot" : SHOT.test(`${m.name} ${m.notes ?? ""}`));
const isHotDrink = (m: MenuItem) =>
  m.drink_kind ? ["coffee", "hot_tea", "hot_chocolate"].includes(m.drink_kind) : HOT_DRINK.test(m.name);
/** Not a plate anyone eats as their order: a side, an extra. */
const notAPlate = (m: MenuItem) => m.dish_role === "side" || m.dish_role === "addon" || m.dish_type === "side_starch";

/*
 * What fits in the glass, by where and when (owner, 27 Oct 2026: meals must
 * make sense and be intentional). Gemini's drink kinds (0096) in four groups;
 * a drink it has not read fits anywhere, as before.
 */
const SOFT_DRINKS = new Set(["soda", "malt", "fresh_juice", "bottled_juice", "smoothie", "milkshake", "iced_tea", "local_drink", "mocktail", "iced_coffee"]);
const HOT_DRINKS = new Set(["coffee", "hot_tea", "hot_chocolate"]);
const WINE_AND_BEER = new Set(["local_beer", "imported_beer", "craft_beer", "cider", "palm_wine", "red_wine", "white_wine", "rose_wine", "sparkling_wine", "champagne"]);
const SPIRITS = new Set(["whisky", "vodka", "gin", "rum", "tequila", "brandy_cognac", "liqueur"]);
const PROTEINS = new Set(["chicken", "beef", "goat", "lamb", "pork", "fish", "seafood", "egg", "vegetarian", "vegan"]);
const MORNING_DRINKS = new Set(["coffee", "hot_tea", "hot_chocolate", "iced_coffee", "iced_tea", "fresh_juice", "bottled_juice", "smoothie"]);
// A plate that is a pudding already, whatever course the menu filed it under (0096 dish types).
const SWEET_TYPES = new Set(["pastry", "cake", "ice_cream", "dessert_other", "pancakes_waffles"]);

/**
 * 2 is what people order here, 1 will do, 0 nobody orders it this way.
 *   in the morning: coffee, tea, a juice or a smoothie; a soda will do.
 *   with a meal: lunch is juice, a smoothie, sobolo, a malt or a mocktail;
 *     dinner is a cocktail, wine, a beer or a mocktail. Never a neat spirit,
 *     a shot, an energy drink or a glass of water with the food, and no
 *     alcohol at a family day's or a business meeting's table.
 *   at a cafe (or a restaurant for dessert): coffee, tea, juice, a shake.
 *   at a bar: a cocktail, wine or a beer first, a spirit after.
 */
export function drinkFit(m: MenuItem, where: "meal" | "cafe" | "bar", minute: number, occasion?: string): 0 | 1 | 2 {
  const k = m.drink_kind;
  if (!k) return 1;
  if (k === "still_water" || k === "sparkling_water" || k === "shot" || k === "energy_drink") return 0;
  const evening = minute >= 17 * 60;
  const sober = occasion === "family_day" || occasion === "business_meeting";
  if (where === "bar") return k === "cocktail" || WINE_AND_BEER.has(k) ? 2 : SPIRITS.has(k) || SOFT_DRINKS.has(k) ? 1 : 0;
  // A croissant at ten came with a mint lemonade at a coffee house (27 Oct 2026).
  if (minute < 12 * 60) return MORNING_DRINKS.has(k) ? 2 : SOFT_DRINKS.has(k) ? 1 : 0;
  if (where === "cafe") return HOT_DRINKS.has(k) || SOFT_DRINKS.has(k) ? 2 : evening && !sober && (k === "cocktail" || WINE_AND_BEER.has(k)) ? 1 : 0;
  if (HOT_DRINKS.has(k)) return evening ? 0 : 1;
  if (SOFT_DRINKS.has(k)) return k === "mocktail" || !evening || sober ? 2 : 1;
  if (sober || SPIRITS.has(k)) return 0;
  if (k === "cocktail" || WINE_AND_BEER.has(k)) return evening ? 2 : 1;
  return 1;
}

/*
 * What makes two mains the same order: the meat, fish or egg first, else the
 * kind of dish (0096). Not "vegetarian": at a vegetarian table every main is,
 * and a pizza and a pasta are still two different plates.
 */
const SAME_PLATE = new Set([...PROTEINS].filter((t) => t !== "vegetarian" && t !== "vegan"));
const plateSignature = (m: MenuItem) => (m.dish_tags ?? []).find((t) => SAME_PLATE.has(t)) ?? m.dish_type ?? m.name;

/**
 * Dealt so neighbours differ: a couple's two mains were Spicy Chicken Crispy
 * and Spicy Chicken Breast. Keeps the given order otherwise (recommendations
 * first), only moving a repeat behind something different.
 */
function varied(list: MenuItem[]): MenuItem[] {
  if (list.length < 2 || !list.some((m) => m.dish_tags?.length || m.dish_type)) return list;
  const out: MenuItem[] = [];
  const rest = [...list];
  while (rest.length) {
    const used = new Set(out.map(plateSignature));
    const i = rest.findIndex((m) => !used.has(plateSignature(m)));
    out.push(...rest.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

function drinkLean(m: MenuItem): number {
  if (m.category !== "drink") return 0;
  const text = `${m.name} ${m.notes ?? ""}`;
  if (isShot(m)) return -3;
  if (m.drink_kind === "cocktail") return 1.5;
  if (COCKTAIL.test(text) && m.is_alcoholic !== false && !/mocktail|non-alcoholic|\bvirgin\b/i.test(text)) return 1.5;
  return 0;
}

function looksScore(v: Venue, occasion: string): number {
  /*
   * Unrated scores zero rather than a middling two or three. Treating an
   * unjudged venue as average would let it outrank one somebody actually
   * looked at and called plain, on no evidence at all.
   */
  if (v.aesthetics == null) return 0;
  // Centred on 3, so a 5 lifts and a 1 genuinely pushes a venue down.
  return (Number(v.aesthetics) - 3) * (LOOKS_WEIGHT[occasion] ?? 1);
}

/**
 * Does this kitchen cook what was asked for?
 *
 * Three answers, not two. `false` means the venue is recorded as the other
 * thing and must not be offered: someone who asked for waakye should not be
 * sent for pasta. `null` means nobody has recorded it, which is allowed but
 * unpreferred, because on the day this ships every row is null and reading
 * "we do not know" as "no" would empty the shortlist entirely.
 */
/** How far a swap may move a stop: a neighbourhood, not a different town. */
const SWAP_RADIUS_KM = 5;
/** Runners-up kept per stop: enough that a few taps keep finding somewhere new. */
const SWAP_OPTIONS = 4;
/** How far a fallback swap may be, when nothing within SWAP_RADIUS_KM fits. */
const SWAP_FAR_KM = 8;
/**
 * How far over budget a fallback swap may take the plan: a fifth of it, at
 * least GHS 50.
 *
 * Plans are fitted to the budget, so most leave little unspent, and a swap
 * held strictly inside it often had nowhere to go: a dessert stop at 80 with
 * 55 spare, and the next dessert place at 180. A place a little dearer, with
 * the card saying exactly how far over the plan now is, is a choice; "Nothing
 * else fits here" is none. Options inside the budget always come first.
 */
function swapStretch(budget: number): number {
  return Math.max(50, Math.round(budget * 0.2));
}

function cuisineFit(v: Venue, want: PlanCuisine): boolean | null {
  if (want === "either") return true;
  // Only a kitchen can be the wrong cuisine. A bowling alley is neither.
  if (v.type !== "restaurant" && v.type !== "cafe") return true;
  if (!v.cuisine) return null;
  return v.cuisine === "both" || v.cuisine === want;
}

/*
 * What the venue study (0088) says a place is like, for places entered with
 * few tags of their own (28 Oct 2026). Plans kept going to the same tag-rich
 * venues: those picked often carried 3.5 vibe tags, those never picked 1.9,
 * whatever they were like, because every tag is three points. Inferred tags
 * count two, and only where a venue has fewer than three of its own; calm and
 * lively are left to the noise reading, which insightScore already scores.
 */
export function inferredTags(v: Venue): string[] {
  if (v.vibe_tags.length >= 3 || !v.insights) return [];
  const ins = v.insights;
  const out = new Set<string>();
  if ((ins.occasion_fit.anniversary ?? 0) >= 8 || (ins.occasion_fit.date_night ?? 0) >= 8) out.add("romantic");
  if ((v.type === "restaurant" || v.type === "cafe") && ins.signature_dishes.length >= 2) out.add("foodie");
  if (v.type === "activity") out.add("fun");
  if (ins.features.includes("outdoor_seating")) out.add("outdoorsy");
  if (ins.features.includes("sea_view")) {
    out.add("beach");
    out.add("scenic");
  }
  if (ins.features.includes("rooftop")) out.add("scenic");
  return [...out].filter((t) => !v.vibe_tags.includes(t));
}

/** Whether the occasion suits a venue: its own best_for, or the study's fit where best_for says little. */
export function suitsOccasion(v: Venue, occasion: string): boolean {
  return v.best_for.includes(occasion) || (v.best_for.length < 2 && (v.insights?.occasion_fit[occasion] ?? 0) >= 8);
}

function scoreVenue(v: Venue, inputs: PlanInputs, wantedTags: string[], atMinute?: number): number {
  const overlap = v.vibe_tags.filter((t) => wantedTags.includes(t)).length;
  const inferred = inferredTags(v).filter((t) => wantedTags.includes(t)).length;
  const occasion = suitsOccasion(v, inputs.occasion) ? 1 : 0;
  const inArea = inputs.areaIds.includes(v.area_id) ? 1 : 0;
  /*
   * Weighted above a vibe tag. Someone who picks local has asked for a kind of
   * food, not a mood, and a recorded match should beat a place that merely
   * shares an adjective.
   */
  const cuisine = cuisineFit(v, inputs.cuisine) === true && inputs.cuisine !== "either" ? 4 : 0;
  /*
   * Naming a kitchen outranks everything else here.
   *
   * Somebody who asks for Korean has said the most specific thing the
   * questionnaire allows, and a place that actually serves it should beat one
   * that merely shares a mood -- six, so it clears two vibe tags. Still a
   * score and not a filter: on a night when nothing Korean is open, a good
   * evening somewhere else beats no evening at all.
   *
   * Absent cuisines score nothing rather than counting against, because 80 of
   * 194 venues have none recorded and an unrecorded kitchen is unknown, not
   * wrong.
   */
  const named = inputs.cuisines ?? [];
  const specific =
    named.length && (v.cuisines ?? []).some((c) => named.includes(c.toLowerCase())) ? 6 : 0;
  /*
   * A family day leans hard towards somewhere children are welcome. Tagged
   * family-friendly, or marked best for family days, scores like two vibe
   * matches; the bar exclusion is a filter, applied where the slots are built.
   */
  const family = familyBonus(v, inputs);
  return (
    overlap * 3 +
    inferred * 2 +
    occasion * 2 +
    inArea +
    cuisine +
    specific +
    family +
    premiumLean(v, inputs) +
    placeFit(v, inputs.partner?.place ?? "") +
    interestFit(v, inputs.partner?.interests ?? "") -
    avoidPenalty(v, inputs.partner?.avoid ?? "") +
    formalityScore(v, inputs.formality) +
    looksScore(v, inputs.occasion) +
    // Gemini's study of the place: noise against what they asked for, fit for the occasion (insights.ts).
    insightScore(v, inputs, atMinute) +
    // How often people keep it once they are shown it, at most two points either way (pull.ts).
    pullScore(v) +
    // How much like the places this person keeps, at most 1.5 either way (taste.ts).
    (v.taste ?? 0) -
    anniversaryCafe(v, inputs) -
    (v.estimate && !v.estimate.needed ? ESTIMATE_PENALTY : 0)
  );
}

/*
 * What a place with no menu gives up against one with (PlanInputs.estimates):
 * two points, most of a vibe tag. Asked for "less, unless they need to be
 * shown" (owner, 29 Oct 2026), so it wins where it fits clearly better,
 * serves the cuisine named or is the only thing open and near, and otherwise
 * waits. The meal gives up two more, since it is the stop whose dishes matter
 * most (optionsForVenue). Nothing in an area they named that has few priced
 * places (estimate.needed). They are thinner on record as well, so even
 * without this they won no slot in 100 sample plans in well-covered areas:
 * the swap list keeps one place for them (toStops).
 */
export const ESTIMATE_PENALTY = 2;

/**
 * Date nights and anniversaries lean to the best places the money reaches.
 *
 * The planner scored a premium restaurant like any other, so a couple with
 * GHS 1,200 was sent somewhere premium on about a quarter of stops, and a
 * date night reads as the evening to spend on. Five points, more than a vibe
 * tag and a half, once the budget is at least GHS 425 a head, the level at
 * which premium venues are shortlisted at all for two. A boost and never a
 * filter: the real menu still has to fit the budget, and where it does not
 * the planner falls back as it always did.
 */
const PREMIUM_FLOOR_PER_HEAD = 425;
export function premiumLean(v: Venue, inputs: Pick<PlanInputs, "occasion" | "budget" | "partySize">): number {
  if (v.price_band !== "premium") return 0;
  if (inputs.occasion !== "date_night" && inputs.occasion !== "anniversary") return 0;
  return inputs.budget / Math.max(1, inputs.partySize) >= PREMIUM_FLOOR_PER_HEAD ? 5 : 0;
}

/** What a venue of this kind is ordered for when it fills this slot (planOrders, opts.course). */
function standIn(role: Role, type: VenueType): "dessert" | "light" | "drinks" | undefined {
  if (type !== "restaurant" && type !== "cafe") return undefined;
  if (role === "dessert") return "dessert";
  if (role === "lounge") return "drinks";
  if (role === "cafe" && type === "restaurant") return "light";
  if (role === "activity") return "light";
  return undefined;
}

/*
 * What somebody does not eat (Diet, 28 Oct 2026), read from Gemini's dish
 * tags (0096) and, for dishes it has not read or tags it missed, the dish's
 * own words. Strict about plates: a vegetarian main is one marked vegetarian,
 * never one that merely names no meat, because "Jollof" alone comes with
 * chicken more often than not. Sides, desserts and drinks pass unless they
 * name the thing.
 */
const MEAT_TAGS = ["chicken", "beef", "goat", "lamb", "pork", "fish", "seafood"];
const MEAT_WORDS =
  /\b(chicken|beef|goat|lamb|mutton|pork|bacon|ham|sausages?|pepperoni|salami|turkey|duck|fish|tilapia|salmon|tuna|prawns?|shrimps?|crab|lobster|calamari|squid|octopus|seafood|wings?|suya|kebabs?|steaks?|burgers?|shawarma|meat|gizzards?|kofta|khebab|chichinga)\b/i;
const PORK_WORDS = /\b(pork|bacon|ham|pepperoni|salami|prosciutto|chorizo|pancetta)\b/i;
const BEEF_WORDS = /\b(beef|steaks?|brisket|oxtail|wagyu|bolognese|corned)\b/i;
const SEA_WORDS =
  /\b(fish|tilapia|salmon|tuna|snapper|grouper|sea ?bass|prawns?|shrimps?|crab|lobster|calamari|squid|octopus|oysters?|mussels?|seafood|sushi|sashimi|anchov(y|ies)|kpanla|redfish)\b/i;
const DAIRY_WORDS = /\b(milk|cream|cheese|butter|yogh?urt|latte|cappuccino|milkshake|ice cream|gelato|paneer|ghee|honey|mayo(nnaise)?)\b/i;

export function dietMenu(menu: MenuItem[], diet: Diet[] | undefined): MenuItem[] {
  if (!diet?.length) return menu;
  const no = new Set(diet);
  return menu.filter((m) => {
    if (m.category === "activity") return true;
    const text = `${m.name} ${m.notes ?? ""}`;
    const tags = new Set(m.dish_tags ?? []);
    if (no.has("no_pork") && (tags.has("pork") || PORK_WORDS.test(text))) return false;
    if (no.has("no_beef") && (tags.has("beef") || BEEF_WORDS.test(text))) return false;
    if (no.has("no_seafood") && (tags.has("fish") || tags.has("seafood") || SEA_WORDS.test(text))) return false;
    if (m.category === "drink" || m.dish_role === "drink") {
      return !(no.has("vegan") && (m.drink_kind === "milkshake" || DAIRY_WORDS.test(text)));
    }
    if (!no.has("vegan") && !no.has("vegetarian")) return true;
    const meaty = MEAT_TAGS.some((t) => tags.has(t)) || MEAT_WORDS.test(text);
    const plate = m.dish_role ? ["main", "light", "starter"].includes(m.dish_role) : m.category === "main" || m.category === "starter";
    if (no.has("vegan")) {
      if (tags.has("vegan")) return !meaty;
      return !plate && !meaty && !tags.has("egg") && !DAIRY_WORDS.test(text) && m.dish_role !== "dessert" && m.dish_role !== "pastry";
    }
    if (tags.has("vegetarian") || tags.has("vegan")) return !MEAT_TAGS.some((t) => tags.has(t));
    return !plate && !meaty;
  });
}

/** Whether a line on a bill is a dessert: what Gemini says it is (0096), else the menu's own section. */
function isDessertLine(menu: MenuItem[], item: string): boolean {
  const m = menu.find((x) => x.name === item);
  return m ? (m.dish_role ? m.dish_role === "dessert" : m.category === "dessert") : false;
}

/**
 * How stop i of a finished plan is ordered for, so a group's own orders
 * (groupPlan.ts) keep the plan's rules: what the place stands in for, the
 * occasion's drinks, food at the meal, and one dessert an evening.
 */
export function orderRulesFor(
  stops: Pick<PlannedStop, "role" | "venue" | "event" | "orders">[],
  i: number,
  occasion: string,
  menuOf: (venueId: string) => MenuItem[]
): { course?: "dessert" | "light" | "drinks"; occasion: string; noDessert: boolean; meal: boolean } {
  const st = stops[i];
  const sweet = (x: (typeof stops)[number]) =>
    x.venue.type === "dessert" || x.orders.some((o) => isDessertLine(menuOf(x.venue.id), o.item));
  return {
    course: standIn(st.role, st.venue.type),
    occasion,
    noDessert: st.role === "meal" && stops.slice(i + 1).some(sweet),
    meal: st.role === "meal" && !st.event,
  };
}

/**
 * What a stop is called: a meal is breakfast, brunch, lunch or dinner by the
 * hour it starts. After midnight is still the night before: food at ten past
 * twelve is a late dinner, not breakfast.
 */
function roleLabel(role: Role, minute: number): string {
  if (role !== "meal") return ROLE_LABEL[role];
  const m = ((minute % 1440) + 1440) % 1440;
  if (m < 4 * 60 || m >= 16 * 60 + 30) return "DINNER";
  return m < 11 * 60 ? "BREAKFAST" : m < 12 * 60 + 30 ? "BRUNCH" : "LUNCH";
}

/**
 * Three points off a plain cafe on an anniversary.
 *
 * Kosta Coffee for croissants is a fine Tuesday and the wrong way to mark a
 * year together (owner, 27 Oct 2026). A cafe somebody rated beautiful (4 or
 * 5) keeps its place: the point is the room, not the coffee.
 */
export function anniversaryCafe(v: Venue, inputs: Pick<PlanInputs, "occasion">): number {
  if (inputs.occasion !== "anniversary" || v.type !== "cafe") return 0;
  return v.aesthetics != null && Number(v.aesthetics) >= 4 ? 0 : 3;
}

/** Six points on a family day for somewhere children are welcome. */
export function familyBonus(v: Venue, inputs: Pick<PlanInputs, "occasion">): number {
  return inputs.occasion === "family_day" && (v.vibe_tags.includes("family_friendly") || v.best_for.includes("family_day"))
    ? 6
    : 0;
}

/** The words a venue says about itself, for the checks below that tags cannot answer. */
const venueWords = (v: Venue) => `${v.name} ${v.description ?? ""}`.toLowerCase();

/*
 * "Their kind of place", from the questionnaire's choices, as what a venue
 * has to show to match it. Tags where the catalogue carries one; the venue's
 * own words where it does not, because there is no rooftop tag and a rooftop
 * bar says "rooftop".
 */
const feature = (v: Venue, f: string) => Boolean(v.insights?.features.includes(f));
const PLACE_MATCH: Record<string, (v: Venue) => boolean> = {
  rooftops: (v) => feature(v, "rooftop") || /rooftop|roof top|sky ?(bar|lounge)|skyline/.test(venueWords(v)),
  // From the venue study's features (0088), which no setting used to ask for (28 Oct 2026).
  "sea views": (v) => feature(v, "sea_view") || v.vibe_tags.includes("beach") || /sea ?view|ocean ?view|beachfront|seaside/.test(venueWords(v)),
  "outdoor seating": (v) => feature(v, "outdoor_seating") || /outdoor seating|terrace|courtyard|garden|open[- ]air/.test(venueWords(v)),
  "air-conditioned": (v) => feature(v, "air_conditioned"),
  "live music": (v) => feature(v, "live_music") || /live (music|band)|jazz night|live performance/.test(venueWords(v)),
  gardens: (v) => v.vibe_tags.includes("outdoorsy") || /garden|courtyard|open[- ]air/.test(venueWords(v)),
  beachside: (v) => v.vibe_tags.includes("beach") || /beach|seaside|oceanfront/.test(venueWords(v)),
  "cosy corners": (v) => v.vibe_tags.includes("calm") || v.vibe_tags.includes("chill"),
  "lively spots": (v) => v.vibe_tags.includes("lively") || v.vibe_tags.includes("dancing"),
  "quiet and calm": (v) => v.vibe_tags.includes("calm") && !v.vibe_tags.includes("lively"),
};

/*
 * Four points a matched preference, at most eight: as much as naming a local
 * or continental kitchen, and more than a vibe tag. At two it was a nudge
 * nobody could see: across eighteen plans for somebody whose kind of place is
 * "beachside", not one stop was on a beach. Still a score, never a filter.
 */
/*
 * What they are into, which reached the description and nothing else: a
 * plan for somebody into films never leaned towards a cinema (28 Oct 2026).
 * Three points a match, at most six: a nudge the size of a vibe tag, read
 * from what the catalogue can actually tell.
 */
const INTEREST_MATCH: Record<string, (v: Venue) => boolean> = {
  music: (v) => feature(v, "live_music") || v.vibe_tags.includes("dancing") || /live (music|band)|jazz|karaoke|\bdj\b|concert|highlife|afrobeats/.test(venueWords(v)),
  films: (v) => /cinema|\bfilms?\b|movies?|silverbird|imax|screening/.test(venueWords(v)),
  games: (v) => /\bgames?\b|arcade|bowling|kart|paintball|laser tag|escape room|snooker|pool table|playstation|ps5|board games?|trampoline/.test(venueWords(v)),
  books: (v) => /\bbooks?\b|library|reading|literary|bookshop/.test(venueWords(v)),
  fashion: (v) => feature(v, "instagrammable") || /boutique|fashion|style/.test(venueWords(v)),
  photos: (v) => feature(v, "instagrammable") || feature(v, "rooftop") || feature(v, "sea_view") || v.vibe_tags.includes("scenic"),
  karaoke: (v) => /karaoke/.test(venueWords(v)),
  nature: (v) => v.type === "outdoor" || v.vibe_tags.includes("outdoorsy") || /garden|nature|forest|lake|waterfall|hike|botanical/.test(venueWords(v)),
};

export function interestFit(v: Venue, interests: string): number {
  const wants = interests.toLowerCase().split(",").map((p) => p.trim()).filter((p) => INTEREST_MATCH[p]);
  return Math.min(6, wants.filter((p) => INTEREST_MATCH[p](v)).length * 3);
}

export function placeFit(v: Venue, place: string): number {
  const wants = place.toLowerCase().split(",").map((p) => p.trim()).filter((p) => PLACE_MATCH[p]);
  const hits = wants.filter((p) => PLACE_MATCH[p](v)).length;
  return Math.min(8, hits * 4);
}

/*
 * What to avoid, as what would make a venue wrong. Spicy food is absent on
 * purpose: nothing in the catalogue says how spicy a kitchen is, and guessing
 * from a cuisine is the kind of claim this planner does not make. It still
 * reaches the written description.
 */
const AVOID_MATCH: Record<string, (v: Venue) => boolean> = {
  "loud music": (v) => v.vibe_tags.includes("dancing") || v.vibe_tags.includes("lively") || /\bclub\b|\bdj\b|live band/.test(venueWords(v)),
  crowds: (v) => v.vibe_tags.includes("lively") || v.vibe_tags.includes("dancing"),
  "long walks": (v) => v.type === "outdoor" || /hike|hiking|trail|walking tour/.test(venueWords(v)),
  smoke: (v) => /shisha|hookah|cigar|smoking/.test(venueWords(v)),
};

/** One avoid, as a yes or no: group hard no's filter venues with these rather than score them. */
export function avoidHit(v: Venue, key: "loud music" | "crowds" | "long walks" | "smoke"): boolean {
  return AVOID_MATCH[key](v);
}

/** Five points each: heavier than a preference, since avoiding is the stronger ask. */
export function avoidPenalty(v: Venue, avoid: string): number {
  const said = avoid.toLowerCase().split(",").map((p) => p.trim()).filter((p) => AVOID_MATCH[p]);
  return said.filter((p) => AVOID_MATCH[p](v)).length * 5;
}

/* ── orders ───────────────────────────────────────────────────────────── */

export interface OrderPlan {
  orders: ItineraryOrder[];
  cost: number;
  /**
   * How the stop was priced, which decides whether a group can split it into
   * personal orders (groupPlan.ts): "menu" is dishes a person chooses; "unit"
   * is a court or a booking charged per group or per hour; "fallback" is the
   * cheapest single line; "typical" is the venue's average; "estimate" is a
   * guess where we hold no menu (Venue.estimate); "free" is nothing to pay.
   * Absent means "menu", the common case.
   */
  basis?: "menu" | "unit" | "fallback" | "typical" | "estimate" | "free";
  /** Food with no drink on it, because none on our copy of the menu suits: cheaper on paper than at the table. */
  dry?: boolean;
}

/** One line of a bill: a dish, how many of it, and what that comes to. */
type OrderLine = ItineraryOrder;

/**
 * The menu somebody who does not drink may be ordered from.
 *
 * The asymmetry is the whole point. A drink counts as safe only when it is
 * recorded false; recorded nothing is not good enough, because the rule that
 * filled that column reads names, and names miss things. Corona, Monkey 47,
 * Olmeca and Ciroc all came out of the backfill unknown, and every one of them
 * is a drink. Offering an unknown to the person who asked not to drink would
 * be treating our own ignorance as their reassurance.
 *
 * Food is the other way round: unknown is fine, and only a dish that names the
 * bottle it was cooked in is withheld. Requiring a positive clearance on every
 * plate would leave them nothing to eat.
 *
 * There are 398 drinks in the catalogue confirmed alcohol-free, which is
 * enough to build an evening from. If that number ever gets thin, the fix is
 * to record more of them, not to relax this.
 */
export function drinkable(menu: MenuItem[], choice: PlanInputs["alcohol"]): MenuItem[] {
  if (choice !== "none") return menu;
  return menu.filter((m) =>
    m.category === "drink" ? m.is_alcoholic === false : m.is_alcoholic !== true
  );
}

const byPrice = (a: MenuItem, b: MenuItem) => Number(a.price_ghs) - Number(b.price_ghs);

/**
 * What one drink usually costs here: the middle of the single-serve drinks,
 * rounded to the nearest five. Null when the menu has none to go on.
 */
function typicalDrink(menu: MenuItem[]): number | null {
  const prices = byTheGlass(menu.filter((m) => m.category === "drink"))
    .filter((m) => Number(m.price_ghs) > 0)
    .map((m) => Number(m.price_ghs))
    .sort((a, b) => a - b);
  if (!prices.length) return null;
  return Math.round(prices[Math.floor(prices.length / 2)] / 5) * 5;
}

/**
 * Where on a sorted price list a tier starts looking.
 *
 * The cheap tier used to start at the very bottom, and the bottom of a long
 * menu is not the cheap end of dinner: it is the sides, the breakfast
 * leftovers and whatever somebody filed under mains because it had to go
 * somewhere. The Honeysuckle lists seventy mains, and the two cheapest are
 * Indomie noodles and an egg stew, which is what a table for two was quoted
 * for an evening out. Nobody sits down in a restaurant to eat that.
 *
 * So the modest end rather than the floor. A quarter of the way up is still
 * unmistakably the cheap choice, and on a cheap menu it is still cheap,
 * because a percentile moves with the venue instead of assuming a price. What
 * it is not is the one item nobody orders.
 */
const CHEAP_POINT = 0.25;

/**
 * How much of an evening to order.
 *
 * 0 is the modest end of the menu, 1 is what somebody would typically order,
 * and 2 is a proper sit-down: something to start, something to drink and
 * something sweet after.
 *
 * Two exists because the fitting could only ever give things up. It walks down
 * when the plan costs too much and climbs back to what it surrendered, but a
 * plan that never exceeded the budget surrendered nothing, so there was
 * nothing to climb back to and the leftover money simply sat there. Somebody
 * with a generous budget got a typical order and half their money unspent.
 *
 * Note what generosity is here: more courses at the same prices, not dearer
 * plates. Reaching up the price list to spend a budget would be choosing
 * expensive food on somebody's behalf, which is not what they asked for.
 */
export type OrderTier = 0 | 1 | 2;

function priceCentre(tier: OrderTier, count: number): number {
  return tier === 0
    ? Math.floor((count - 1) * CHEAP_POINT)
    : Math.floor(count / 2);
}

/**
 * What this many people would actually order here.
 *
 * `tier` picks how far up the menu to reach: 0 is the cheapest thing that
 * still constitutes a visit, 1 is a typical order. Fitting a budget means
 * walking stops back down the tiers rather than inventing cheaper items.
 */
/**
 * Which place a venue is, branches counted as one.
 *
 * A plan checked only that it never used the same venue twice, so an
 * evening at Atomic Junction went to Chocolate Sarayi in East Legon and then
 * Chocolate Sarayi at Accra Mall: two stops, one dessert. Branches are named
 * "Brand - Place" or "Brand (Place)", so the brand is the name up to that
 * suffix, with accents and the Turkish dotless i folded ("Chocolate Sarayı"
 * is the Osu branch of the same shop).
 */
export function brandOf(v: { name: string }): string {
  return v.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .split(/\s+[-–|]\s+|\s*\(/)[0]
    .replace(/\s+restaurant$/, "")
    .trim();
}

/**
 * A line sold only to children: "(Kids)", "under 12s", "Trampoline, under 12
 * years". Something for adults and children together is not one of these.
 */
function childOnly(m: MenuItem): boolean {
  const text = `${m.name} ${m.notes ?? ""}`.toLowerCase();
  if (/\badults?\b|\b1[0-8]\s*(and|&)\s*over\b|\b1[0-8]\s*\+/.test(text)) return false;
  return /\b(kids?|child(ren)?|toddlers?|juniors?)\b|\bunder[\s-]*\d{1,2}\s*(s|yrs?|years?)?\b/.test(text);
}

/** A line bought on top of another and never on its own: an extra token, an add-on. */
function addOnOnly(m: MenuItem): boolean {
  const text = `${m.name} ${m.notes ?? ""}`.toLowerCase();
  return /\badd[\s-]?ons?\b|not sold on its own|\bon top of\b|\bextra (token|game|round|life)\b|\btop[\s-]?up\b/.test(text);
}

export function planOrders(
  venue: Venue,
  menu: MenuItem[],
  partySize: number,
  tier: OrderTier,
  durationMins: number,
  /** Minutes past midnight the party is expected to arrive. */
  slotStartMinute: number,
  /**
   * Kitchens the party asked for, if any. Used to choose which half of a
   * mixed menu to order from; never to refuse a venue.
   */
  wantedCuisines: string[] = [],
  /**
   * At a spa, the treatments to book, one of each. Unlike cuisine this is a
   * filter: see WELLNESS_KINDS. Empty is any single treatment.
   */
  treatments: WellnessKind[] = [],
  /** The plan's weekday, 0 = Sunday, for prices sold only on some days. */
  planWeekday: number | null = null,
  /** Whether children may be in the party: a family day. Kids' lines are for nobody else. */
  withChildren = false,
  /**
   * seat: where in the menu window to start dealing. A group deals each
   * person's order alone (partySize 1), and starting everyone at the same
   * dish gave twelve people the same jollof. 0 is today's behaviour exactly.
   */
  opts: {
    seat?: number;
    /**
     * What this stop is for when the venue is standing in for another kind:
     * a restaurant in the dessert slot is there for dessert, in a cafe or bar
     * slot for a drink and something small. A second full meal an hour after
     * the first was the plan nobody wanted (owner, 27 Oct 2026).
     */
    course?: "dessert" | "light" | "drinks";
    /** A dessert stop comes later in the plan, so this meal leaves dessert to it. */
    noDessert?: boolean;
    /** The occasion, for what fits in the glass (drinkFit). */
    occasion?: string;
    /**
     * This stop is the meal: whatever kind of place it is, it orders food,
     * and a place with none on our copy of its menu cannot be the meal. A
     * lounge in the meal slot was ordered drinks and nothing else.
     */
    meal?: boolean;
    /**
     * Kinds of dish an earlier stop of the same outing already served
     * (0096 dish types): steered clear of where the menu has something else,
     * so it is not eggs at the café and eggs again at lunch.
     */
    avoidTypes?: string[];
  } = {}
): OrderPlan | null {
  const seat = Math.max(0, Math.floor(opts.seat ?? 0));
  // Which treatment an order is being dealt for, while the spa branch runs.
  let onlyKind: WellnessKind | null = null;
  /*
   * Venues that charge for a thing rather than for a person.
   *
   * A padel court is priced by the hour whoever turns up, so four players
   * split one bill and the cost per head halves as the group grows, the
   * opposite of a menu, where four people means four mains. Handled before the
   * menu because a court with a drinks list is still charged for the court.
   */
  const mode = venue.pricing_mode ?? "per_person";
  const unit = Number(venue.unit_price_ghs ?? 0);

  if (mode !== "per_person" && unit > 0) {
    // Charged in whole hours in practice; a 90-minute slot is billed as two.
    const hours = Math.max(1, Math.ceil(durationMins / 60));

    if (mode === "per_group") {
      return {
        orders: [{ item: `Booking for ${partySize}`, qty: 1, price_ghs: Math.round(unit) }],
        cost: Math.round(unit),
        basis: "unit",
      };
    }
    if (mode === "per_hour") {
      const total = Math.round(unit * hours);
      return {
        orders: [
          {
            item: `${hours} hour${hours === 1 ? "" : "s"}, shared between ${partySize}`,
            qty: 1,
            price_ghs: total,
          },
        ],
        cost: total,
        basis: "unit",
      };
    }
    if (mode === "per_hour_per_person") {
      const total = Math.round(unit * hours * partySize);
      return {
        orders: [
          {
            item: `${hours} hour${hours === 1 ? "" : "s"} each`,
            qty: partySize,
            price_ghs: total,
          },
        ],
        cost: total,
        basis: "unit",
      };
    }
  }

  /*
   * Whether this party can actually buy this line.
   *
   * Cypher Zone will not run laser tag for fewer than six players, so offering
   * it to a couple is offering something they will be refused at the desk. A
   * maximum only bites when one purchase covers one person: a foosball table
   * caps at two because it IS two, and a party of four simply buys two tables.
   */
  const fitsParty = (m: MenuItem): boolean => {
    /*
     * A treatment, not an add-on. See WELLNESS_TREATMENT_MIN_GHS: without this
     * the budget walk-down reached Signature Spa's GHS 30 gel removal and
     * Resense's GHS 0 couples package, and called either one a spa visit.
     */
    if (venue.type === "wellness" && !(Number(m.price_ghs) >= WELLNESS_TREATMENT_MIN_GHS)) return false;
    /*
     * The treatment they asked for, and only that. A filter rather than a
     * preference, unlike cuisine: a pedicure is not a lesser massage, it is a
     * different afternoon, and a spa with nothing of the kind is left for one
     * that has it.
     */
    if (venue.type === "wellness" && onlyKind && !treatmentMatches(onlyKind, m.name)) return false;
    if (m.min_players != null && partySize < m.min_players) return false;
    /*
     * A kids' line is for a family day and nobody else. Bliss sells the
     * trampoline as "12 and over" and "under 12s", and a birthday for six
     * adults was booked onto the under-12s one because it was cheaper.
     */
    if (!withChildren && childOnly(m)) return false;
    const covers = Math.max(1, m.covers_people ?? 1);
    /*
     * A maximum of one on a per-person line is not a cap on the party: it is
     * the line saying "per person", and a couple simply books two. Signature
     * Spa records every treatment that way, and reading it as a cap meant no
     * couple could ever be sent there for anything.
     */
    if (covers === 1 && m.max_players != null && m.max_players > 1 && partySize > m.max_players) return false;
    return onSaleNow(m);
  };

  /*
   * Whether this price applies at the hour the party arrives.
   *
   * Aura sells the same padel court at GHS 300 before 4pm and GHS 600 after
   * it. Without this the planner would sort by price, find the 300 first and
   * quote an evening booking at half what the desk charges. The window is
   * half-open, so a 16:00 arrival is peak rather than off-peak, which is how
   * the poster reads it.
   *
   * The arrival minute can run past midnight for a late plan, so it is wrapped
   * back into the day before comparing.
   */
  function onSaleNow(m: MenuItem): boolean {
    /*
     * The day first. A late plan's slot can run past midnight, and then it is
     * the next day's price that applies.
     */
    if (m.available_days?.length && planWeekday != null) {
      const day = (planWeekday + Math.floor(slotStartMinute / 1440)) % 7;
      if (!m.available_days.includes(day)) return false;
    }
    const from = m.available_from_minute;
    const to = m.available_to_minute;
    if (from == null && to == null) return true;

    const at = ((slotStartMinute % 1440) + 1440) % 1440;
    // A window that runs past midnight, 22:00 to 02:00, is two spans.
    if (from != null && to != null && to <= from) return at >= from || at < to;
    if (from != null && at < from) return false;
    if (to != null && at >= to) return false;
    return true;
  }

  const pick = (category: string): MenuItem | null => {
    const items = menu.filter((m) => m.category === category && fitsParty(m)).sort(byPrice);
    if (!items.length) return null;
    if (tier === 0) return items[priceCentre(0, items.length)];
    // The median is a better "typical" than the mean, which one costly
    // item drags upward.
    return items[Math.floor(items.length / 2)];
  };

  /**
   * What a group of this size would actually order from one list.
   *
   * Not the same dish times seven. The planner used to choose a single item
   * per category and multiply it by the head count, which is how a birthday
   * table of seven was quoted seven vegetarian okro stews: nobody orders like
   * that, and the one dish it landed on was whichever happened to sit at the
   * median price. A real table orders a spread.
   *
   * The spread is drawn from a small window around the tier's price point, so
   * a cheap plan stays cheap and a typical one stays typical, and it is dealt
   * round-robin so the variety appears at two people as well as at seven.
   * With only one dish on the list, this is exactly the old behaviour.
   */
  const dining = venue.type === "restaurant" || venue.type === "cafe" || Boolean(opts.meal);
  /** What this menu sells to eat a stew with. */
  const bases = dining ? menu.filter((m) => isBase(m) && fitsParty(m) && Number(m.price_ghs) > 0) : [];

  /*
   * Which dishes belong to a course: what Gemini says each one is, on a menu
   * it has read (0096), and the menu's own category otherwise. Menus file
   * croissants, egg plates and add-on portions under "main"; the course is
   * built from what a dish is, not from where the menu put it.
   */
  const labelled = menu.filter((m) => m.dish_role).length >= Math.max(3, menu.length * 0.6);
  const inCourse = (m: MenuItem, category: string): boolean => {
    if (!labelled || !m.dish_role || category === "activity" || category === "other" || m.category === "activity") {
      return m.category === category;
    }
    if (category === "drink") return m.dish_role === "drink";
    if (category === "main") return m.dish_role === "main" || (venue.type === "cafe" && m.dish_role === "light");
    if (category === "starter") return m.dish_role === "starter";
    if (category === "dessert") return m.dish_role === "dessert" || (venue.type === "cafe" && m.dish_role === "pastry");
    return m.category === category;
  };
  // Where a drink is being ordered, for drinkFit.
  const drinkWhere: "meal" | "cafe" | "bar" = opts.meal
    ? "meal"
    : venue.type === "lounge" || opts.course === "drinks"
      ? "bar"
      : venue.type === "cafe" || opts.course === "dessert" || opts.course === "light"
        ? "cafe"
        : "meal";

  /*
   * Why this dish, when there is a reason worth a line (28 Oct 2026): what
   * this person tends to pick, what the place is known for, or what people
   * have recommended. Most dishes have none, and say nothing.
   */
  const reasonFor = (m: MenuItem): string | null => {
    if (m.category === "activity") return null;
    if (dishTaste(venue.tasteWords, `${m.name} ${(m.dish_tags ?? []).join(" ")} ${m.dish_type ?? ""}`.replace(/_/g, " ")) > 0) {
      return "Like what you usually pick";
    }
    if (isSignature(venue, m.name)) return "What they're known for";
    const n = m.recommend_count ?? 0;
    return n >= 2 ? `Recommended by ${n} people` : null;
  };

  const orderFrom = (category: string, people: number): OrderLine[] => {
    let all = menu.filter((m) => inCourse(m, category) && fitsParty(m)).sort(byPrice);
    // A restaurant whose menu holds no full plate at all still feeds people from its light ones.
    if (!all.length && category === "main" && labelled) {
      all = menu.filter((m) => m.dish_role === "light" && m.category !== "drink" && fitsParty(m)).sort(byPrice);
    }
    // A drink each means a glass each, never a bottle per head. See bottles.ts.
    if (category === "drink") all = byTheGlass(all);
    /*
     * And not a round of shots, where the bar pours anything else. Weighting
     * alone moved shots from 48% of drink lines to 44% (they fill whole price
     * windows), so with three or more other drinks to order, shots are left
     * off the order. A bar that is mostly shots still gets them.
     */
    if (category === "drink") {
      const noShots = all.filter((m) => !isShot(m));
      if (noShots.length >= 3) all = noShots;
      // Plain water is ordered only where there is nothing else to drink.
      const notWater = all.filter((m) => !isWater(m));
      if (notWater.length) all = notWater;
      // What fits here and now (drinkFit): the best where there is a choice of it, else what will do.
      const best = all.filter((m) => drinkFit(m, drinkWhere, slotStartMinute, opts.occasion) >= 2);
      const fine = all.filter((m) => drinkFit(m, drinkWhere, slotStartMinute, opts.occasion) >= 1);
      /*
       * And nothing where nothing fits, with the table told to allow for a
       * drink (below). Our copy of 805's menu has only its coffee and tea,
       * and a birthday dinner for six at half seven was ordered hot
       * chocolates and lattes with its fufu (27 Oct 2026).
       */
      all = best.length >= 2 ? best : fine;
    }
    /*
     * And what suits the hour. The plan check kept finding scrambled eggs and
     * an omelette ordered for a seven o'clock dinner, and cappuccinos at a
     * half-ten nightcap: a café's whole menu is all-day, and price alone does
     * not know breakfast from dinner. From five, breakfast dishes are left
     * off a meal; from nine, coffee and tea are left off the drinks. Each only
     * where three or more other things remain, so a breakfast place still
     * serves breakfast.
     */
    if (slotStartMinute >= breakfastEnds(planWeekday) && category !== "drink" && category !== "activity") {
      /*
       * What Gemini has marked breakfast is never ordered after it, even if
       * nothing is left: the course then falls through to the next one (a
       * pastry, a dessert, just a drink), which is what a cafe at seven in the
       * evening is for. Croissants at seven and an English breakfast at a
       * quarter past eight were the alternative (meal:smoke, 27 Oct 2026).
       * Dishes not yet read keep the old rule: only where three others remain.
       */
      all = all.filter((m) => m.meal_time == null || m.meal_time === "anytime");
      const notBreakfast = all.filter((m) => !isBreakfastDish(m));
      if (notBreakfast.length >= 3) all = notBreakfast;
    }
    if (slotStartMinute >= LATE_NIGHT && category === "drink") {
      const notCoffee = all.filter((m) => !isHotDrink(m));
      if (notCoffee.length >= 3) all = notCoffee;
    }
    /*
     * At a table, a side is never somebody's meal and a stew is only ordered
     * where it can be eaten. See accompaniments.ts: plain rice filed as a
     * starter was a dinner on a tight budget, and an egg stew with nothing to
     * eat it with was a date. Each step only narrows when something is left.
     */
    /*
     * A meal is a full plate. Where Gemini has read the menu, the mains are
     * the dishes it calls a main, not the light plates, sides and pastries a
     * menu files under "main": croissants and an egg plate were somebody's
     * anniversary lunch (27 Oct 2026). Only where two or more full plates
     * remain, so a light menu still feeds people.
     */
    if (category === "main" && dining) {
      const full = all.filter((m) => m.dish_role === "main" || (venue.type === "cafe" && m.dish_role === "light"));
      if (full.length >= 2) all = full;
      /*
       * Nor a piece of a plate. "Meat GHS 20", "Fufu GHS 15" and "Okro stew
       * only" are what a chop bar adds to a plate, filed as mains: anything
       * under 40% of this menu's middle main is not somebody's meal.
       */
      if (labelled && all.length >= 3) {
        const prices = all.map((m) => Number(m.price_ghs)).sort((a, b) => a - b);
        const middle = prices[Math.floor(prices.length / 2)];
        const real = all.filter((m) => Number(m.price_ghs) >= middle * 0.4);
        if (real.length >= 2) all = real;
      }
    }
    /*
     * And breakfast is for the morning: before eleven (half past twelve at the
     * weekend) a meal is ordered from the breakfast and brunch plates, where
     * the kitchen has two or more, not jollof at eight.
     */
    if ((category === "main" || category === "other") && slotStartMinute < breakfastEnds(planWeekday) - 60) {
      const morning = all.filter((m) => m.meal_time === "breakfast" || m.meal_time === "brunch");
      if (morning.length >= 2) all = morning;
    }
    // A starter for a table is something to share, where the kitchen marks some that way (0096).
    if (category === "starter" && partySize > 1) {
      const sharing = all.filter((m) => m.dish_tags?.includes("sharing"));
      if (sharing.length >= 2) all = sharing;
    }
    if (dining && category !== "drink" && category !== "dessert") {
      const meals = all.filter((m) => !isBase(m) && !notAPlate(m));
      const fed = bases.length ? meals : meals.filter((m) => !needsBase(m));
      /*
       * On a menu Gemini has read, never a side or an extra even when nothing
       * else is left: before its salads are served, L'Accrasien's "other" is
       * its build-your-own breakfast, and a GHS 50 portion of fried eggs was
       * somebody's order (27 Oct 2026). The course is left empty instead, and
       * the next one, or just a coffee, is the order.
       */
      all = fed.length ? fed : meals.length ? meals : labelled ? [] : all;
    }
    // Not what an earlier stop already served, where there is something else (the variety pass).
    if (opts.avoidTypes?.length && category !== "drink" && category !== "activity") {
      const fresh = all.filter((m) => !m.dish_type || !opts.avoidTypes!.includes(m.dish_type));
      if (fresh.length) all = fresh;
    }
    if (!all.length || people < 1) return [];

    /*
     * Order from the half of the menu they asked for.
     *
     * A venue carrying four cuisines is still one menu, and choosing on price
     * alone meant asking for Italian at Kula Bistro and being handed a
     * burger: the right venue, the wrong half of its list. So when somebody
     * named a kitchen, dishes that read as belonging to it come first.
     *
     * A preference and never a filter. Where nothing matches -- an ambiguous
     * menu, a cuisine this has no words for -- the whole list comes back and
     * the pick is what it always was. Refusing to feed somebody because their
     * dish names are unusual would be a worse answer than a generic order.
     *
     * The price window below is applied after this, so a cheap plan stays
     * cheap within the cuisine rather than reaching for its priciest dish.
     */
    /*
     * An add-on is bought on top of something, never instead of it: "Arcade,
     * extra token" says in its own notes it is not sold alone, and at GHS 10
     * it is what the cheap tier reached for first.
     */
    if (category === "activity") {
      const standalone = all.filter((m) => !addOnOnly(m));
      if (standalone.length) all = standalone;
    }

    const wanted = wantedCuisines;
    const onTheme = wanted.length
      ? all.filter((m) => dishMatchesCuisine(m.name, m.notes, wanted))
      : [];
    const items = onTheme.length ? onTheme : all;

    // At most four distinct dishes: enough to read as a table rather than a
    // canteen queue, few enough that the total stays predictable.
    const WIDTH = 4;
    const centre = priceCentre(tier, items.length);
    const from = Math.max(0, Math.min(centre - 1, items.length - WIDTH));
    let candidates = items.slice(from, from + WIDTH);

    /*
     * What people recommend, first.
     *
     * Two steps, both inside the price the tier already chose. A recommended
     * dish up to two places either side of the window may take the place of an
     * unrecommended one in it, so the price barely moves; then the window is
     * dealt most-recommended first, so a couple's two dishes are the two
     * people liked. With no recommendations anywhere near, nothing changes.
     */
    /*
     * And what the place is known for (the study's signature dishes), worth
     * two recommendations: the shawarma people come for, not a side that
     * happened to sit at the right price.
     */
    // And what this person adds and takes off at other stops (taste.ts), up to two either way.
    const rec = (m: MenuItem) =>
      (m.recommend_count ?? 0) + (isSignature(venue, m.name) ? 2 : 0) + drinkLean(m) +
      // Its tags and type too (0096), so a taste for grilled fish reaches dishes not named that way.
      dishTaste(venue.tasteWords, `${m.name} ${(m.dish_tags ?? []).join(" ")} ${m.dish_type ?? ""}`.replace(/_/g, " "));
    const near = items.slice(Math.max(0, from - 2), from + WIDTH + 2);
    const outsiders = near.filter((m) => rec(m) > 0 && !candidates.includes(m)).sort((a, b) => rec(b) - rec(a));
    for (const m of outsiders) {
      const unliked = candidates.map((c, i) => [c, i] as const).filter(([c]) => rec(c) <= 0).pop();
      if (!unliked) break;
      candidates = candidates.map((c, i) => (i === unliked[1] ? m : c));
    }
    candidates = [...candidates].sort((a, b) => rec(b) - rec(a) || byPrice(a, b));

    /*
     * Something to do is done together.
     *
     * A table orders a spread, one dish each; a group at a bowling alley does
     * not split up so that one person bowls alone while another is on the
     * trampoline. A birthday for six was dealt exactly that way, two on the
     * arcade, two on mini-bowling, one trampoline and one game of bowling.
     * So everybody gets the same activity, and at the fullest order a second
     * one, also for everybody. A line that covers several people (a lane, a
     * table) is bought once per that many. Not at a spa, where each person
     * has their own treatment and the spread is the point.
     */
    if (category === "activity" && venue.type !== "wellness") {
      const n = tier === 2 && candidates.length > 1 ? 2 : 1;
      return candidates.slice(0, n).map((m) => {
        const qty = Math.ceil(people / Math.max(1, m.covers_people ?? 1));
        return {
          item: m.name,
          qty,
          price_ghs: Math.round(Number(m.price_ghs) * qty),
          note: m.notes ?? null,
        };
      });
    }

    // Two people, two different plates: chicken and fish, not two chickens.
    if (category === "main" || category === "starter") {
      /*
       * From just outside the window where it is all one kind, as a
       * recommendation may: Polo Club's four mains at GHS 240 were all
       * vegetarian pasta, with a bolognese at the same price beside them
       * (meal:smoke, 27 Oct 2026).
       */
      const kinds = new Set(candidates.map(plateSignature));
      if (people > 1 && candidates.length > 1 && kinds.size === 1) {
        const mid = Number(candidates[Math.floor(candidates.length / 2)].price_ghs);
        const other = near
          .filter((m) => !candidates.includes(m) && !kinds.has(plateSignature(m)))
          .sort((a, b) => Math.abs(Number(a.price_ghs) - mid) - Math.abs(Number(b.price_ghs) - mid))[0];
        if (other) candidates = [...candidates.slice(0, -1), other];
      }
      candidates = varied(candidates);
    }

    const counts = new Map<string, { item: MenuItem; qty: number }>();
    let covered = 0;
    for (let i = 0; covered < people && i < people * 2 + WIDTH; i++) {
      const m = candidates[(i + seat) % candidates.length];
      const seen = counts.get(m.id) ?? { item: m, qty: 0 };
      seen.qty += 1;
      counts.set(m.id, seen);
      covered += Math.max(1, m.covers_people ?? 1);
    }

    return [...counts.values()].map(({ item, qty }) => ({
      item: item.name,
      qty,
      price_ghs: Math.round(Number(item.price_ghs) * qty),
      // The menu's own words, for the names that need them.
      note: item.notes ?? null,
      why: reasonFor(item),
    }));
  };

  const lines: OrderLine[] = [];
  // Set where food goes out with no drink we could price beside it (the note below says so).
  let dry = false;

  /*
   * The rice, yam, banku or fufu each stew is eaten with, one per portion,
   * from this menu at its own price. Two dishes that want the same side share
   * the line. A stew at a venue that lists no sides keeps a note to ask,
   * because a side there is usually extra and we do not know its price.
   */
  const withBases = (dishes: OrderLine[]): OrderLine[] => {
    const byName = new Map(menu.map((m) => [m.name, m]));
    const want = new Map<string, { base: MenuItem; qty: number; dishes: string[] }>();
    for (const d of dishes) {
      const item = byName.get(d.item);
      if (!item || !needsBase(item)) continue;
      const base = pickBase(item, bases);
      if (!base) {
        d.note = [d.note, "Ask what it is served with; a side may cost extra."].filter(Boolean).join(" ");
        continue;
      }
      const w = want.get(base.id) ?? { base, qty: 0, dishes: [] };
      w.qty += d.qty;
      w.dishes.push(d.item.toLowerCase().replace(/\s+only$/, ""));
      want.set(base.id, w);
    }
    return [...want.values()].map((w) => ({
      item: w.base.name,
      qty: w.qty,
      price_ghs: Math.round(Number(w.base.price_ghs) * w.qty),
      note: `To eat with the ${[...new Set(w.dishes)].join(" and ")}`,
    }));
  };

  /*
   * Food and nothing to drink, because the menu we hold lists no drinks
   * (Bella Dolce Vita, Le Pavillon) or none that go with this (805 has only
   * its coffee and tea): said on the plate, not left for the table to find
   * out. No price, because we have none.
   */
  const allowForDrinks = () => {
    const held = menu.filter((m) => m.category === "drink" || m.dish_role === "drink");
    const food = lines.filter((l) => !held.some((m) => m.name === l.item));
    if (!food.length || food.length !== lines.length) return;
    const only = (kinds: Set<string>) => held.every((m) => m.drink_kind != null && kinds.has(m.drink_kind));
    const why = !held.length
      ? "Drinks aren't on our copy of their menu yet"
      : only(HOT_DRINKS)
        ? "Our copy of their menu only has coffee and tea to drink"
        : only(new Set(["still_water", "sparkling_water"]))
          ? "Our copy of their menu only has water to drink"
          : "None of the drinks on our copy of their menu suit this";
    const last = food[food.length - 1];
    last.note = [last.note, `${why}: allow extra for drinks.`].filter(Boolean).join(" ");
    dry = true;
  };

  // The meal is had at a table: never a dessert shop's waffles, nor a gallery's door.
  if (opts.meal && venue.type !== "restaurant" && venue.type !== "cafe" && venue.type !== "lounge") return null;

  if ((venue.type === "restaurant" || venue.type === "cafe") && opts.course) {
    const small = (cats: string[]) => cats.map((c) => () => orderFrom(c, partySize)).reduce<OrderLine[]>((f, n) => (f.length ? f : n()), []);
    if (opts.course === "dessert") lines.push(...small(["dessert", "starter"]));
    if (opts.course === "light") lines.push(...small(opts.noDessert ? ["starter", "other"] : ["dessert", "starter", "other"]));
    lines.push(...orderFrom("drink", partySize));
    allowForDrinks();
    // A stand-in with nothing light to offer falls through to the empty-menu handling below.
  } else if (venue.type === "restaurant" || venue.type === "cafe" || (opts.meal && venue.type === "lounge")) {
    // A meal's plate is a main or a starter: "other" is where a lounge keeps its shisha.
    const mains = (
      opts.meal
        ? [() => orderFrom("main", partySize), () => orderFrom("starter", partySize)]
        : [() => orderFrom("main", partySize), () => orderFrom("other", partySize), () => orderFrom("starter", partySize)]
    ).reduce<OrderLine[]>((found, next) => (found.length ? found : next()), []);
    if (opts.meal && !mains.length) return null;

    /*
     * Courses around the mains, only at the fullest tier and only when there
     * are real mains to put them around. Without that guard a venue with no
     * main course falls back to ordering its starters as the main event, and
     * would then be served the same starters again as a first course.
     */
    const hasMains = menu.some((m) => m.category === "main");
    /*
     * A starter to share, one for every two or three people, not one each:
     * a couple orders one plate of wings between them.
     */
    if (tier === 2 && hasMains) {
      const shared = partySize > 1 ? Math.ceil(partySize / 3) : 1;
      lines.push(
        ...orderFrom("starter", shared).map((o) => (partySize > 1 ? { ...o, note: [o.note, "To share"].filter(Boolean).join(" · ") } : o))
      );
    }

    /*
     * A café with nothing on the plate is still somewhere to eat: a pastry or
     * a dessert rather than a glass of water and nothing else.
     */
    if (!mains.length) mains.push(...orderFrom("dessert", partySize));

    lines.push(...mains);
    lines.push(...withBases(mains));

    /*
     * A drink each, at every tier. It was only from the middle tier, so a
     * modest order was two croissants with nothing to drink; nobody sits down
     * to eat without one (owner, 27 Oct 2026). Spread too, because a table of
     * seven does not order seven of the same thing to drink either.
     */
    lines.push(...orderFrom("drink", partySize));
    /*
     * Dessert at the fullest tier, but not when a dessert stop comes next
     * (one dessert an evening, at the place for it), not in the morning, and
     * not after a plate that was sweet already: a croissant and then a
     * tiramisu at ten is two puddings (Kosta, 27 Oct 2026).
     */
    const sweetPlate = mains.some((l) => {
      const m = menu.find((x) => x.name === l.item);
      return m != null && (m.dish_role === "pastry" || m.dish_role === "dessert" || SWEET_TYPES.has(m.dish_type ?? ""));
    });
    const morning = slotStartMinute < breakfastEnds(planWeekday) - 60;
    if (tier === 2 && hasMains && !opts.noDessert && !morning && !sweetPlate) lines.push(...orderFrom("dessert", partySize));

    allowForDrinks();
  } else if (venue.type === "dessert") {
    const sweet = orderFrom("dessert", partySize);
    lines.push(...(sweet.length ? sweet : orderFrom("other", partySize)));
  } else if (venue.type === "lounge") {
    const drinks = orderFrom("drink", partySize);
    lines.push(...(drinks.length ? drinks : orderFrom("other", partySize)));
  } else if (venue.type === "wellness" && treatments.length) {
    /*
     * One of each treatment asked for, at this one spa. A spa that cannot do
     * all of them is not the answer to the question, so it is refused here
     * and the planner looks for one that can, or says none does.
     */
    for (const kind of treatments) {
      onlyKind = kind;
      const got = [
        () => orderFrom("activity", partySize),
        () => orderFrom("other", partySize),
      ].reduce<OrderLine[]>((found, next) => (found.length ? found : next()), []);
      onlyKind = null;
      if (!got.length) return null;
      lines.push(...got);
    }
  } else {
    /*
     * Activities and outdoor spots. "activity" first, because a go-kart and a
     * game of bowling are priced lines on a list, while "other" is the bucket
     * a flat entry fee lands in.
     */
    const entry = [
      () => orderFrom("activity", partySize),
      () => orderFrom("other", partySize),
      () => orderFrom("main", partySize),
    ].reduce<OrderLine[]>((found, next) => (found.length ? found : next()), []);
    lines.push(...entry);
  }

  if (!lines.length) {
    // Where Gemini has read the menu, nothing sensible to order is a refusal: the cheapest line there is bread or an extra.
    if (dining && labelled) return null;
    /*
     * The category we wanted is not on this menu, a restaurant listing only
     * drinks, say. Fall back to the cheapest thing it does sell before
     * falling back to the average, because reaching the average when the menu
     * is empty AND the average is zero produced a free stop, which is the
     * exact failure that made rooftop bars cost nothing.
     */
    /*
     * Filtered the same way, which the fallback used not to be. Reaching past
     * fitsParty for "the cheapest thing it does sell" would hand a party of
     * two a six-player laser tag game, and would quote Aura's GHS 300
     * afternoon rate for an eleven o'clock booking, because the off-peak line
     * is the cheapest on the list and nothing here was checking the clock.
     */
    const anything = menu.filter(fitsParty).sort(byPrice)[0];
    if (anything) {
      const price = Math.round(Number(anything.price_ghs) * partySize);
      return {
        orders: [
          { item: anything.name, qty: partySize, price_ghs: price, note: anything.notes ?? null },
        ],
        cost: price,
        basis: "fallback",
      };
    }

    /*
     * No menu we hold, in a plan that asked for such places (matching.ts):
     * what similar places charge a head, budgeted at the top, and the line
     * says it is a guess. The one exception to the rule below, opted into.
     * A head's guess is a whole visit, so it is no use for a restaurant
     * standing in for pudding or a drink (opts.course), and a bar's or a
     * dessert shop's is no meal.
     */
    if (venue.estimate) {
      if (opts.course || (opts.meal && venue.type !== "restaurant" && venue.type !== "cafe")) return null;
      const { low, high } = venue.estimate;
      return {
        orders: [
          {
            item: `No menu yet, about GHS ${low} to ${high} a head`,
            qty: partySize,
            price_ghs: high * partySize,
            note: "We don't have their menu yet, so this is what similar places charge. We've budgeted for the top of it.",
            estimate: { low, high },
          },
        ],
        cost: high * partySize,
        basis: "estimate",
      };
    }

    const each = Math.round(Number(venue.avg_cost_per_person_ghs));

    // A place to eat is priced from its menu or not at all (MENU_ONLY_TYPES): never "Typical spend".
    if (MENU_ONLY_TYPES.has(venue.type)) return null;

    /*
     * Nothing priced at all. A venue flagged free is genuinely free and can
     * carry a stop at zero; one that simply has no prices on file is withheld,
     * because planning a free visit to somewhere that charges is how a plan
     * lies about what an evening costs.
     */
    if (each <= 0) {
      return freeToVisit(venue) ? { orders: [], cost: 0, basis: "free" } : null;
    }
    return {
      orders: [
        { item: "Typical spend, per person", qty: partySize, price_ghs: each * partySize },
      ],
      cost: each * partySize,
      basis: "typical",
    };
  }

  /*
   * covers_people is already accounted for inside orderFrom: a foosball table
   * at GHS 30 covers two, so a couple is dealt one of them rather than one
   * each, and a party of four gets two tables.
   */
  const orders = lines;
  const cost = orders.reduce((s, o) => s + o.price_ghs, 0);

  /*
   * A floor on what a visit can cost.
   *
   * Bliss sells arcade play only in bags of ten tokens at GHS 100, so the
   * cheapest line on its list, a single GHS 10 token, is not something anyone
   * can walk in and buy. Quoting it would put a price in the plan that the
   * counter will not honour.
   */
  const floor = Number(venue.minimum_spend_ghs ?? 0);
  if (floor > 0) {
    const least = Math.round(floor * partySize);
    if (cost < least) {
      return {
        orders: [{ item: `Minimum spend, GHS ${floor} each`, qty: partySize, price_ghs: least }],
        cost: least,
        basis: "menu",
      };
    }
  }

  return { orders, cost, basis: "menu", ...(dry ? { dry } : {}) };
}

/* ── planning ─────────────────────────────────────────────────────────── */

export interface PlannedStop {
  venue: Venue;
  role: Role;
  /** Weekly fixtures on while the party is here. Usually empty. */
  fixtures?: VenueSchedule[];
  /** Set when this stop is the event the evening was built around. */
  event?: {
    id: string;
    title: string;
    start_time: string | null;
    image_url: string | null;
  } | null;
  label: string;
  durationMins: number;
  arrivalMinutes: number;
  orders: ItineraryOrder[];
  cost: number;
  /**
   * Runners-up for this slot, so a swap needs no round trip. Each carries the
   * orders and cost the planner computed for it, re-deriving a price at the
   * point of swap is how a venue with no menu ends up shown as free.
   */
  alternates: {
    venue: Venue;
    orders: ItineraryOrder[];
    cost: number;
    charges: StopCharge[];
    label: string;
    /** A film stop's swaps are other films (filmSwaps): each carries its own showing. */
    event?: PlannedStop["event"];
  }[];
  /** What the venue adds to the bill, already counted in cost. */
  charges: StopCharge[];
  /** The order tier this stop was planned at (0 modest, 2 full). */
  tier?: OrderTier;
  /** How the stop was priced; decides what a group may split into personal orders. */
  basis?: StopBasis;
}

/** OrderPlan.basis, plus "door": a stop priced only by its entry or ticket. */
export type StopBasis = NonNullable<OrderPlan["basis"]> | "door";

export interface PlannedItinerary {
  stops: PlannedStop[];
  hops: { from: string; to: string; mins: number; cost_ghs: number }[];
  foodTotal: number;
  transportTotal: number;
  total: number;
  /** Whether the total can be stated exactly, or only as a range. */
  confidence: PriceConfidence;
  /** Set when the plan had to be trimmed to fit. */
  trimmed: boolean;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * The rides between stops, and what they cost.
 *
 * Driving zeroes the fare and keeps the minutes: the journey still takes as
 * long, it just is not bought. The time matters as much as the money here,
 * because arrival times and the opening-hours checks are laid out from it.
 */
function hopsFor(stops: PlannedStop[], driving = false, cars = 1) {
  const hops = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i].venue;
    const b = stops[i + 1].venue;
    const est = estimateHop(a, b);
    hops.push({
      from: a.areas?.name ?? "",
      to: b.areas?.name ?? "",
      mins: est.mins,
      // A taxi is priced per car, and a group of eight needs two of them.
      cost_ghs: driving ? 0 : est.cost_ghs * Math.max(1, cars),
    });
  }
  return hops;
}

/** Lay arrival times out from the start, adding travel between stops. */
function schedule(stops: PlannedStop[], startMinutes: number, hops: ReturnType<typeof hopsFor>) {
  let t = startMinutes;
  stops.forEach((s, i) => {
    s.arrivalMinutes = t;
    t += s.durationMins + (hops[i]?.mins ?? 0);
  });
}

/**
 * Build the best itinerary that fits the budget, or null when none does.
 *
 * Fitting is a walk down, not a search: start with a typical order everywhere,
 * then downgrade the most expensive stop, then drop the last stop, and only
 * give up once two stops at their cheapest still will not fit. That order
 * keeps as much of the evening as possible rather than silently returning a
 * cheap two-stop plan when three were affordable.
 */
/**
 * How much of a shortlist is simply shut that evening.
 *
 * Asked only when planning has already failed, so the answer can say "most of
 * Osu is closed on a Monday" instead of blaming a budget that was never the
 * problem. Telling someone to raise their spend when the real fix is to come
 * on Tuesday sends them round a loop that cannot end.
 */
export function openOnDate(
  venues: Venue[],
  dateISO: string,
  startTime: string,
  hours: number
): { open: number; closed: number; unknown: number } {
  const weekday = weekdayOf(dateISO);
  if (weekday === null) return { open: venues.length, closed: 0, unknown: 0 };

  const start = minutesOf(startTime);
  const span = Math.round(hours * 60);
  let open = 0;
  let closed = 0;
  let unknown = 0;

  for (const v of venues) {
    const periods = parsePeriods(v.opening_periods);
    if (!periods) {
      unknown++;
      continue;
    }
    // Open at any point during the outing counts; a plan can start late or
    // finish early, and this is a diagnosis rather than a selection.
    let any = false;
    for (let at = 0; at <= span && !any; at += 30) {
      const t = start + at;
      if (isOpenAt(periods, (weekday + Math.floor(t / 1440)) % 7, t % 1440)) any = true;
    }
    if (any) open++;
    else closed++;
  }
  return { open, closed, unknown };
}

/**
 * Plan without letting a bar stand in for another kind of stop, and only if
 * nothing can be built that way, plan again allowing it.
 *
 * A bar in the dessert slot is a real compromise on a small budget, where it
 * may be the only thing that fits, and a wrong one everywhere else. Two passes
 * give both: the plan everybody should get when there is one, and the
 * compromise instead of an empty screen when there is not.
 */
/**
 * How much a venue's score may move from one plan to the next: under an
 * occasion match (2) and a vibe tag (3), so a clearly better fit still wins.
 *
 * Without it the planner was a pure function of the request, and among
 * equally good places the tie went to the cheapest every time. Measured over
 * 150 ordinary requests on 7 Oct 2026, 46 of the 97 restaurants and cafes
 * with priced menus never reached a single plan, 42 of them despite being
 * shortlisted, some 30 times, while four places took a third of the stops.
 */
const VARIETY = 2;

export interface PlanOptions {
  /** Cars the party needs for each ride, for groups; one taxi takes four. Default 1. */
  cars?: number;
  /** Fixed per-venue variety, so checks can be repeated exactly. Default: a random draw. */
  variety?: (venueId: string) => number;
}

export function planItinerary(
  inputs: PlanInputs,
  candidates: Candidates,
  opts: PlanOptions = {}
): PlannedItinerary | null {
  // One draw per venue per plan, shared by both attempts so they agree.
  const draws = new Map<string, number>();
  const variety =
    opts.variety ??
    ((id: string) => {
      if (!draws.has(id)) draws.set(id, Math.random() * VARIETY);
      return draws.get(id)!;
    });
  const cars = Math.max(1, Math.floor(opts.cars ?? 1));
  // A night of events is strung together from the day's events alone, with no meal slot to fill (eventNight.ts).
  if (inputs.eventNight) return planEventNight(inputs, candidates, variety, cars);
  return planWith(inputs, candidates, false, variety, cars) ?? planWith(inputs, candidates, true, variety, cars);
}

function planWith(
  inputs: PlanInputs,
  candidates: Candidates,
  barsMayStandIn: boolean,
  variety: (venueId: string) => number = () => 0,
  cars = 1
): PlannedItinerary | null {
  /*
   * A spa stop runs longer the more it books: an hour a treatment, and never
   * under the hour and a half a single visit is given.
   */
  const spaMinutes = Math.max(ROLE_MINUTES.wellness, 60 * wellnessKindsOf(inputs).length);
  const roleMinutes = (r: Role) => (r === "wellness" ? spaMinutes : ROLE_MINUTES[r]);

  const wantedTags = expandVibes(inputs.vibes);
  const clubHopping = inputs.vibes.some((v) => v.toLowerCase() === "club hopping");
  const menuByVenue = new Map<string, MenuItem[]>();
  candidates.menuItems.forEach((m) => {
    const list = menuByVenue.get(m.venue_id) ?? [];
    list.push(m);
    menuByVenue.set(m.venue_id, list);
  });
  const isDessertAt = (venue: Venue, item: string) => isDessertLine(menuByVenue.get(venue.id) ?? [], item);
  // A venue's menu as this plan may order from it: their drinking and what they do not eat.
  const venueMenu = (venue: Venue) => dietMenu(drinkable(menuByVenue.get(venue.id) ?? [], inputs.alcohol), inputs.diet);

  /*
   * What each venue does weekly, indexed by the venue's own id.
   *
   * fetchCandidates has loaded these since migration 0032 and, like the day's
   * events before today, nothing has ever read them: karaoke on a Thursday
   * could be entered in the admin and had no way of reaching a plan or a card.
   */
  const schedulesByVenue = new Map<string, VenueSchedule[]>();
  for (const row of candidates.schedules ?? []) {
    const list = schedulesByVenue.get(row.venue_id) ?? [];
    list.push(row);
    schedulesByVenue.set(row.venue_id, list);
  }

  const startMinutes = minutesOf(inputs.startTime);
  const startHour = Math.floor(startMinutes / 60);

  /*
   * Their own car, so the budget buys no fares.
   *
   * The money does not vanish, it moves: the walk-down and the climb below
   * both price the whole evening, hops included, so a plan that stops paying
   * for taxis has the same amount left over for a fuller order or a better
   * venue. A budget of zero counts as driving whatever was ticked, because
   * nothing at zero could pay a fare anyway.
   */
  const driving = isDriving(inputs);

  /*
   * What is on that night, if anything, and the evening is built around it.
   *
   * fetchCandidates has been loading the day's events since the first version
   * of this file and nothing ever read them. So an event entered in the admin
   * could not reach a plan however precisely somebody aimed at it, right date,
   * right area, right hours, and the slot still went to whichever restaurant
   * scored highest, with nothing said about why.
   *
   * Only an event at a venue in the shortlist can be honoured. One with no
   * venue is a happening somewhere in an area: there is no menu to order from,
   * no price to put against it and no coordinates to route to, and inventing
   * any of the three is worse than leaving it out.
   */
  type Anchor = { event: EventRow; venue: Venue; at: number | null };
  const anchor: Anchor | null = (() => {
    const byId = new Map(candidates.venues.map((v) => [v.id, v]));
    const endMinutes = startMinutes + Math.round(inputs.hours * 60);

    const placeable = candidates.events
      .map((event) => ({
        event,
        venue: event.venue_id ? byId.get(event.venue_id) : undefined,
        // "19:00:00" and "19:00" both give the same answer here.
        at: event.start_time ? minutesOf(event.start_time) : null,
      }))
      .filter(
        (x): x is Anchor =>
          x.venue !== undefined &&
          // An event already over, or starting after everyone has gone home,
          // is not part of this outing. No time on file is not a clash, so it
          // stays in rather than being ruled out by a blank.
          (x.at === null || (x.at >= startMinutes - 30 && x.at < endMinutes))
      )
      /*
       * The one that fits best, then the earliest.
       *
       * It was earliest alone, which was right when a day had one event. A
       * Friday with Gaderin's listings has fourteen, and a sporty plan from
       * eleven got the 11:00 pottery class while the 18:00 social padel it
       * was asked for never came up. So an event's own vibes and its venue's
       * are matched against what the plan wants first; time only breaks ties,
       * so between two that fit equally the evening still reaches the first
       * without doubling back.
       */
      .map((x) => {
        const tags = new Set([
          ...((x.event as EventRow & { vibe_tags?: string[] }).vibe_tags ?? []),
          // The venue as it is when the event starts, not as it is at night.
          ...vibeTagsAt(x.venue, x.at ?? startMinutes),
        ]);
        /*
         * A night that happens once, ahead of one that happens every day
         * (matching.ts, markRecurring): worth two matched vibes, so DRC's
         * daily go-karting only beats a one-off when it fits what was asked
         * for clearly better. The owner's rule, 23 Oct 2026.
         */
        const once = x.event.recurring ? 0 : 2;
        return { ...x, fit: wantedTags.filter((t) => tags.has(t)).length + once };
      })
      .sort((a, b) => b.fit - a.fit || (a.at ?? startMinutes) - (b.at ?? startMinutes));

    /*
     * A film, when one was asked for, and only then.
     *
     * The showings are only loaded on request (movies.ts), and asked for,
     * the film is the point: it outranks any other night. Among showings,
     * the genres asked for first, then one that leaves room for something
     * before it (an hour in, near enough), then the earliest. A film at the
     * very start of the outing is fine when it is the only one that fits.
     */
    if (inputs.movie) {
      const films = placeable.filter((x) => x.event.kind === "movie" && (x.at == null || x.at >= startMinutes));
      if (films.length) {
        const room = (x: Anchor) => Math.abs((x.at ?? startMinutes) - (startMinutes + 60));
        const fits = (x: Anchor) => genreFits(x.event.vibe_tags, inputs.movieGenres);
        return [...films].sort((a, b) => fits(b) - fits(a) || room(a) - room(b))[0];
      }
    }
    /*
     * Not a party in a plan for talking. A first date, an anniversary, a
     * date night or a meeting was handed the best-matching night of the day,
     * and on a Saturday that was a hype night: the plan check's commonest
     * complaint. Unless they asked for lively or dancing, those occasions
     * skip nights at loud venues (the study, insights.ts) and nights that
     * are dancing or clubbing; a quiet live set or a tasting still fits.
     */
    const talking = ["first_date", "anniversary", "date_night", "business_meeting"].includes(inputs.occasion);
    // Asking for lively, dancing or club hopping is asking for exactly these nights (insights.ts).
    const wantsNoise = noiseWanted(inputs).loud;
    const tooLoud = (x: Anchor) => {
      const tags = ((x.event as EventRow & { vibe_tags?: string[] }).vibe_tags ?? []).map((t) => t.toLowerCase());
      return (
        x.venue.insights?.noise === "loud" ||
        tags.includes("dancing") ||
        /party|rave|club|turn ?up|hype|vibes?\b|nights?\b.*dj|\bdj\b|amapiano|afrobeats/i.test(`${x.event.title} ${x.event.category} ${x.event.description ?? ""}`)
      );
    };
    return placeable.find((x) => x.event.kind !== "movie" && !(talking && !wantsNoise && tooLoud(x))) ?? null;
  })();

  /** Every way one slot could be filled, cheapest order first within a venue. */
  interface Option {
    venue: Venue;
    tier: OrderTier;
    orders: ItineraryOrder[];
    /** Charges included: what the evening actually costs at this venue. */
    cost: number;
    charges: StopCharge[];
    score: number;
    /** Weekly fixtures on while the party is here. Usually none. */
    fixtures: VenueSchedule[];
    /** How it was priced; see OrderPlan.basis. "door" is entry or a ticket only. */
    basis?: StopBasis;
  }

  /*
   * A narrowed focus was asked for explicitly, so its slots are filled only by
   * venues of the right type. The thin-catalogue fallback below is right when
   * we chose the shape ourselves, but applied here it answered "just drinks"
   * with three restaurants, which is not a thin answer to the question, it is
   * an answer to a different one.
   */
  const focusTypes = focusVenueTypes(focusesOf(inputs));

  /*
   * Roughly when a slot will be reached, before anything has been chosen.
   *
   * Exact arrival is not known until venues are picked and travel between them
   * is costed, but opening hours have to be checked before picking, or the
   * choice is made from venues that will be shut. Role lengths plus a flat
   * quarter hour of travel is close enough to keep a 21:00 slot away from a
   * place that closes at 21:00, which is the failure this exists to stop.
   */
  const TRAVEL_ALLOWANCE = 15;
  const nominalStart = (roles: Role[], index: number): number => {
    let t = startMinutes;
    for (let i = 0; i < index; i++) t += roleMinutes(roles[i]) + TRAVEL_ALLOWANCE;
    return t;
  };

  const weekday = weekdayOf(inputs.date);

  /**
   * Every way one venue could fill one slot, one entry per order tier.
   *
   * Split out from the slot builder below so a venue can be considered on its
   * own, which is what pinning an event to a slot needs: the slot's own pool
   * is filtered by role type and by opening hours, and an event is itself the
   * statement that this place is open that night and worth being at.
   */
  const optionsForVenue = (
    venue: Venue,
    role: Role,
    slotStart: number,
    opts: {
      ignoreHours?: boolean;
      /**
       * What the door costs per person, when this slot is an event's.
       *
       * Passed in rather than found here, because a dated event belongs to one
       * slot and this function is asked about every slot. Null means no event;
       * zero means somebody recorded that entry is free, which is a price and
       * not the absence of one.
       */
      ticket?: number | null;
      /** This slot is a dated event's: priced by its door alone (see below). */
      event?: boolean;
      /** What the door line says, when not "Entry". */
      doorLabel?: string;
      /** A later bar on a club-hopping night: priced by its door alone (see below). */
      doorOnly?: boolean;
      /** A dessert stop comes later in the plan: this one orders no dessert of its own. */
      dessertAfter?: boolean;
      /** The meal is still to come: no dessert before dinner, here or as a stand-in's course. */
      beforeMeal?: boolean;
    } = {}
  ): Option[] => {
    const roleTypes = ROLE_TYPES[role];
    const out: Option[] = [];

    // Recorded as the other thing. Not a ranking matter: it is the wrong
    // answer to the question that was asked.
    if (cuisineFit(venue, inputs.cuisine) === false) return out;

    /*
     * Shut is shut. Unknown hours are left alone: most of the catalogue has
     * none on file yet, and reading "we do not know" as "closed" would empty
     * the plan, while reading it as "open" is only the assumption already
     * being made everywhere else.
     */
    if (weekday !== null && !opts.ignoreHours) {
      const open = isOpenThroughout(
        parsePeriods(venue.opening_periods),
        weekday,
        slotStart,
        roleMinutes(role)
      );
      if (open === false) return out;
    }

    const menu = venueMenu(venue);

    /*
     * On while they are here, not merely on that day.
     *
     * Karaoke that starts at nine is no use to a table booked for six and gone
     * by eight, and a plan that boasted about it would be selling an evening
     * nobody got. The overlap is tested against this slot's own hours, so the
     * same venue can carry the fixture in a late slot and not in an early one.
     */
    const fixtures = schedulesDuring(
      schedulesByVenue.get(venue.id) ?? [],
      inputs.date,
      slotStart,
      roleMinutes(role)
    );
    const score =
      // Scored as it is at this slot's time: a café-by-day, bar-by-night
      // counts as calm for brunch and lively for ten o'clock (dayEnergy.ts).
      scoreVenue(venueAt(venue, slotStart), inputs, wantedTags, slotStart) +
      (fixtures.length ? (FIXTURE_WEIGHT[inputs.occasion] ?? 1) : 0) +
      variety(venue.id);

    /*
     * A cover charge is money, so it goes in the order rather than beside it.
     *
     * 0032 recorded covers and said they were never added to a plan's total,
     * on the reasoning that null is ambiguous. Null still is, and is still
     * left alone. But a cover somebody actually wrote down is a figure the
     * door will charge, and a budget that fits an evening without it is a
     * budget that breaks at the door. Only counted when the fixture overlaps,
     * because a band starting after they leave costs them nothing.
     */
    const covers = fixtures.filter((f) => f.cover_ghs != null);
    const fixtureCover = covers.reduce((sum, f) => sum + Number(f.cover_ghs), 0);
    const ticket = opts.ticket ?? null;
    /*
     * The venue's usual entry (0075), where nothing more particular says
     * otherwise. A night with its own cover is that night's price, and an
     * event's ticket is the event's, so either replaces the usual one rather
     * than adding to it: nobody pays the Friday cover and the ordinary one.
     */
    const usual =
      !covers.length && ticket == null && venue.entry_fee_ghs != null ? Number(venue.entry_fee_ghs) : null;

    const door = fixtureCover + (ticket ?? 0) + (usual ?? 0);
    const doorTotal = Math.round(door * inputs.partySize);
    /*
     * Whether anybody has actually written the door price down.
     *
     * Kept apart from the figure itself, because zero and unknown are
     * different answers and only one of them is a price. A fixture with a null
     * cover is a fixture somebody recorded without saying what it costs, and
     * reading that as free is how a rooftop bar ends up in a plan at nothing.
     */
    const doorKnown = covers.length > 0 || ticket != null || usual != null;

    const doorLabel = opts.doorLabel
      ? opts.doorLabel
      : fixtures.length
        ? `${fixtures.map((f) => f.title).join(" and ")} — entry`
        : "Entry";
    /*
     * A free door is still worth a line.
     *
     * Somebody recorded that it costs nothing to get in, and a stop showing
     * GHS 0 with no line under it reads as a price we failed to find rather
     * than as one we have. This is the same distinction the rest of the
     * catalogue keeps between free and unknown, said on the card.
     */
    const doorLine: ItineraryOrder[] = doorKnown
      ? [
          {
            item: doorTotal > 0 ? doorLabel : `${doorLabel}, free`,
            qty: inputs.partySize,
            price_ghs: doorTotal,
            door: true,
          },
        ]
      : [];

    /*
     * An event is its ticket, and nothing from the venue's menu.
     *
     * Bowling at Bliss came out as arcade tokens, mini-bowling and the entry:
     * the venue's own list, priced on top of the event's door. But a night
     * somebody organises is not the venue's ordinary evening. Organisers bring
     * their own menu as often as not, what people buy once inside is theirs
     * to decide, and none of it is anything Duro can put on a bill. So the
     * plan says what the event costs to get into, free or paid, and stops.
     * With no price recorded at all it falls through to the venue as before,
     * rather than vanishing from the evening.
     */
    if (opts.event && doorKnown) {
      return [
        {
          venue,
          tier: 0,
          orders: doorLine,
          cost: doorTotal,
          // Nothing is added to a ticket.
          charges: [],
          basis: "door",
          fixtures,
          score: score + (roleTypes.includes(venue.type) ? 2 : 0),
        },
      ];
    }

    /*
     * A club after the first on a club-hopping night is its door, and the
     * drinks are left to them.
     *
     * People pregame, at the first stop or before it, and then move between
     * clubs buying nothing but the way in. Pricing a round at every club
     * charged a three-club night three rounds nobody drinks, and made a free
     * night out look like a GHS 1,000 one. So the door is the price and what
     * a drink costs inside is said in a line, not added: a plan should not
     * spend money on somebody's behalf that they were never going to spend.
     *
     * Only where the entry is recorded. An unknown door priced at nothing is
     * the same lie as an unpriced venue shown as free, so such a club is
     * priced the ordinary way, with drinks, until somebody writes its entry
     * down.
     */
    if (opts.doorOnly && venue.type === "lounge" && doorKnown) {
      const drink = typicalDrink(menu);
      const note = drink
        ? `Drinks here are around GHS ${drink} each, if you want one.`
        : null;
      return [
        {
          venue,
          /*
           * The top tier, because the door is the whole of this stop's order,
           * not a stripped-back one. At tier 0 a club with a recorded free
           * door sorted behind one with unknown entry and a round of drinks,
           * which is the plan this exists to stop making.
           */
          tier: 2,
          orders: doorLine.map((o) => ({ ...o, note })),
          cost: doorTotal,
          charges: [],
          basis: "door",
          fixtures,
          score: score + 2,
        },
      ];
    }

    const priced: Option[] = [];

    for (const tier of [2, 1, 0] as const) {
      const planned = planOrders(
        venue,
        menu,
        inputs.partySize,
        tier,
        roleMinutes(role),
        slotStart,
        inputs.cuisines ?? [],
        wellnessKindsOf(inputs),
        weekdayOf(inputs.date),
        inputs.occasion === "family_day",
        {
          course: standIn(role, venue.type),
          occasion: inputs.occasion,
          noDessert: opts.dessertAfter || opts.beforeMeal,
          // An event in the meal's stop is priced as the event, as before.
          meal: role === "meal" && !opts.event,
        }
      );
      if (!planned) continue;
      // Nothing to order and nothing to pay at the door is a free stop, and
      // only a venue recorded as free may be one.
      if (planned.cost <= 0 && doorTotal <= 0 && !freeToVisit(venue)) continue;
      /*
       * What the venue adds to the bill, counted before the budget is
       * checked, so "fits your budget" is what the till says and not the
       * menu. Nothing recorded adds nothing.
       */
      const charges = chargesOn(planned.cost, {
        service_pct: venue.service_charge_pct,
        tax_pct: venue.tax_added_pct,
      });
      priced.push({
        venue,
        tier,
        orders: [...planned.orders, ...doorLine],
        cost: planned.cost + chargesTotal(charges) + doorTotal,
        charges,
        fixtures,
        basis: planned.basis ?? "menu",
        // Within a focus every venue is allowed, so nudge the slot towards
        // its own role to keep the evening varied rather than three of the
        // same thing.
        // A meal whose drinks we cannot price only looks cheaper, so it waits behind a whole one, all else equal.
        // And a meal with no menu behind one with dishes to choose (ESTIMATE_PENALTY).
        score:
          score +
          (roleTypes.includes(venue.type) ? 2 : 0) -
          (planned.dry ? 1 : 0) -
          (planned.basis === "estimate" && role === "meal" && !venue.estimate?.needed ? 2 : 0),
      });
    }

    /*
     * Nothing to order, but we know what it costs to walk in.
     *
     * Plenty of places have no menu we hold and do not need one: you pay at
     * the door and that is the evening. planOrders returns null for every one
     * of them, because it is looking for something to eat, and until now that
     * null withheld the venue entirely, so a club with a ticketed night could
     * be entered in the admin and still never appear in a plan.
     *
     * Emitted at the lowest tier on purpose. It is a real stop with a real
     * price, and it is also the plainest version of one, so the walk-down
     * should reach for it before it starts stripping courses off a dinner.
     * Never for the meal, though: the price of getting in is not dinner.
     */
    if (!priced.length && doorKnown && (role !== "meal" || opts.event)) {
      priced.push({
        venue,
        tier: 0,
        orders: doorLine,
        cost: doorTotal,
        // A cover at the door has nothing added to it.
        charges: [],
        basis: "door",
        fixtures,
        score: score + (roleTypes.includes(venue.type) ? 2 : 0),
      });
    }

    out.push(...priced);
    return out;
  };

  /*
   * Where each venue is, for the route pass in attempt().
   *
   * A venue's own coordinates where it has them; otherwise the middle of its
   * area, worked out from the venues in that area that do. Plenty of the
   * catalogue has no coordinates -- the Osu Honeysuckle among them -- and a
   * route check that ignored them would be a route check with holes in it.
   * Where neither exists, the same area is treated as next door and a
   * different one as six kilometres off, which is roughly Accra's spacing.
   */
  const centroids = new Map<string, { lat: number; lng: number }>();
  {
    const sums = new Map<string, { lat: number; lng: number; n: number }>();
    for (const v of candidates.venues) {
      if (v.lat == null || v.lng == null) continue;
      const s = sums.get(v.area_id) ?? { lat: 0, lng: 0, n: 0 };
      s.lat += Number(v.lat);
      s.lng += Number(v.lng);
      s.n += 1;
      sums.set(v.area_id, s);
    }
    for (const [id, s] of sums) centroids.set(id, { lat: s.lat / s.n, lng: s.lng / s.n });
  }
  const placeOf = (v: Venue) =>
    v.lat != null && v.lng != null ? { lat: Number(v.lat), lng: Number(v.lng) } : centroids.get(v.area_id) ?? null;
  const kmBetween = (a: Venue, b: Venue): number => {
    const p = placeOf(a);
    const q = placeOf(b);
    if (p && q) return haversineKm(p, q);
    return a.area_id === b.area_id ? 0 : 6;
  };

  const optionsFor = (role: Role, slotStart: number, doorOnly = false, dessertAfter = false, beforeMeal = false): Option[] => {
    const roleTypes = ROLE_TYPES[role];

    /*
     * With a narrowed focus every slot may be filled by anything within that
     * focus, not only by its own role's type. The roles are there to vary the
     * evening, a meal, then something sweet, but "mostly food" must not fail
     * because the catalogue has no dedicated dessert parlour, and it must not
     * quietly reach outside the focus either. Preference for the exact role
     * type is applied in the sort below instead.
     */
    /*
     * No bars on a family day, unless the bar says children are welcome. A
     * lounge can still win an evening slot on score alone, and a family with
     * a seven-year-old sent to a cocktail bar is a plan nobody would keep.
     */
    const venuesHere =
      inputs.occasion === "family_day"
        ? candidates.venues.filter((v) => v.type !== "lounge" || v.vibe_tags.includes("family_friendly"))
        : candidates.venues;
    const pool = focusTypes.length
      ? venuesHere.filter((v) => focusTypes.includes(v.type))
      : venuesHere.filter((v) => roleTypes.includes(v.type));

    /*
     * Preference, then a full order before a minimal one, then price.
     *
     * Sorting on price alone made the first pick the cheapest option in the
     * catalogue, so an ample budget still produced a bare plan. Tier now leads
     * price: start with what someone would actually order, and let the fitting
     * below strip it back only if the budget requires it.
     */
    const build = (from: Venue[]): Option[] =>
      from
        .flatMap((venue) => optionsForVenue(venue, role, slotStart, { doorOnly, dessertAfter, beforeMeal }))
        .sort((a, b) => b.score - a.score || b.tier - a.tier || a.cost - b.cost);

    const preferred = build(pool);

    /*
     * Lunch and dinner are at a restaurant while one can be had. A cafe is
     * cheap and close, and the budget walk and the route pass choose from
     * anywhere in a slot's list (see the bars below), so a birthday dinner
     * for six went to a resto-cafe and a date's lunch was two meat pies at a
     * coffee shop (27 Oct 2026). Breakfast and brunch are a cafe's own meal,
     * and with no restaurant open and priced, or on the second pass, a cafe
     * or a bar with a kitchen still feeds them.
     */
    const tableOnly = role === "meal" && slotStart >= breakfastEnds(weekday) - 60 && !barsMayStandIn;
    const tables = preferred.filter((o) => o.venue.type === "restaurant");

    // Inside a narrowed focus there is no wider pool to fall back to: reaching
    // outside it would answer a different question from the one asked.
    if (focusTypes.length) return tableOnly && tables.length ? tables : preferred;

    /*
     * Nor for a stop somebody named.
     *
     * A business meeting's one place was chosen as a cafe, a lounge or a meal,
     * and a spa was asked for by name. Filling either with "whatever else was
     * to hand" is the same wrong answer the focus rule above refuses: a cafe
     * meeting at GHS 600 for three quietly became Treehouse Restaurant, and a
     * spa that did not fit would have become a restaurant labelled as the spa
     * stop, which also hid the "we could not fit a spa" answer entirely. An
     * empty slot here is honest; the route says why.
     */
    if (role === "wellness" || meetingRole(inputs)) return preferred;
    if (tableOnly && tables.length) return tables;

    /*
     * Everything else, behind everything of the right type.
     *
     * The slot used to be restricted to its own kind, and that restriction
     * failed in two different ways. If no venue of the kind survived the hours
     * check the slot was empty and the whole evening returned nothing: two
     * people with GHS 600 got no plan while GHS 900 planned fine, because
     * widening the price band changed which venues were in the shortlist.
     * And if the sequence wanted two bars while only one survived, the second
     * bar slot found its single venue already taken and failed the same way,
     * which is how asking for five places produced four with no word said.
     *
     * Preference by ordering rather than by exclusion fixes both. Every venue
     * of the right type comes first, whatever it scores, so the natural pick
     * is always the right kind of place; anything else is reachable only once
     * those are exhausted or unaffordable. A bar slot filled by a restaurant
     * is a compromise, and a compromise beats an empty screen.
     */
    /*
     * And the compromise has an order of its own.
     *
     * "Everything else" was one pool sorted by score, so when Osu ran out of
     * dessert parlours the dessert slot went to whichever venue scored
     * highest, and a lively bar pouring shots out-scores a quiet cafe. The
     * Honeysuckle filled the dessert stop in five of eighteen Osu date plans
     * that way. Nearest kind first now: something sweet falls back to a cafe,
     * then a restaurant's dessert list, and a bar only after those.
     */
    /*
     * A meal is only ever had where there is food. "Kinds not listed come
     * after" let a gallery stand in for lunch when the budget was tight, and
     * a date at one o'clock went to two galleries and ate nothing.
     */
    const others = venuesHere.filter(
      (v) =>
        !roleTypes.includes(v.type) &&
        (role !== "meal" || FALLBACK_TYPES.meal.includes(v.type)) &&
        /*
         * Nor a dessert place before the meal: the plan check kept finding
         * evenings that opened on ice cream, because something to do falls
         * back to dessert first (27 Oct 2026) and in the afternoon it comes
         * before dinner.
         */
        !(beforeMeal && v.type === "dessert")
    );
    const order = FALLBACK_TYPES[role];
    const rank = (t: VenueType) => {
      const i = order.indexOf(t);
      return i === -1 ? order.length : i;
    };
    const groups = new Map<number, Venue[]>();
    for (const v of others) {
      const r = rank(v.type);
      groups.set(r, [...(groups.get(r) ?? []), v]);
    }
    const rest = [...groups.keys()].sort((a, b) => a - b).flatMap((r) => build(groups.get(r)!));

    /*
     * Order alone was not enough: the budget walk and the route pass choose
     * from anywhere in a slot's list, and a bar next door is both cheap and
     * close, so it kept winning the dessert stop from behind. So a bar is in a
     * non-bar slot's list only when nothing else could fill it at all.
     */
    if (role !== "lounge" && !barsMayStandIn) {
      return [...preferred, ...rest.filter((o) => o.venue.type !== "lounge")];
    }
    return [...preferred, ...rest];
  };

  const attempt = (
    stopCount: number,
    pin: Anchor | null
  ): PlannedItinerary | null => {
    const roles = withWellness(
      roleSequence(startHour, stopCount, focusesOf(inputs), inputs.vibes, meetingRole(inputs)),
      inputs
    );
    /*
     * Dessert is not a one-in-the-morning stop: the plan check kept finding
     * them, at places mostly shut by then. Past half eleven the slot is a
     * last drink instead, or, on a family day or a meeting, it goes.
     */
    for (let i = roles.length - 1; i >= 0; i--) {
      if (roles[i] !== "dessert" || nominalStart(roles, i) < 23 * 60 + 30) continue;
      if (inputs.occasion === "family_day" || inputs.occasion === "business_meeting" || inputs.alcohol === "none") roles.splice(i, 1);
      else roles[i] = "lounge";
    }

    /*
     * When the event's time is the meal's, the meal moves to the next stop:
     * the night out, then dinner, rather than the night out instead of
     * dinner. Only with another stop to trade with, and never for a film,
     * which has its own placing.
     */
    // Not for a meeting or a narrowed focus, where the event is only placed in a stop of its own kind.
    if (pin && pin.event.kind !== "movie" && roles.length > 1 && !meetingRole(inputs) && !focusTypes.length) {
      const at = pin.at ?? startMinutes;
      const byTime = roles
        .map((role, i) => ({ role, i, gap: Math.abs(nominalStart(roles, i) - at) }))
        .sort((a, b) => a.gap - b.gap);
      if (byTime[0].role === "meal") {
        // Never dessert in front of dinner.
        const swap = byTime.find((x) => x.role !== "meal" && x.role !== "wellness" && x.role !== "dessert");
        if (swap) {
          roles[byTime[0].i] = swap.role;
          roles[swap.i] = "meal";
        }
      }
    }

    /*
     * Club hopping: the first bar is the pregame, priced with drinks, and
     * every bar after it is priced at the door (see optionsForVenue).
     */
    const slots = roles.map((role, i) =>
      optionsFor(
        role,
        nominalStart(roles, i),
        clubHopping && role === "lounge" && roles.slice(0, i).includes("lounge"),
        // One dessert an evening: a meal followed by a dessert stop leaves it to that stop.
        roles.slice(i + 1).includes("dessert"),
        role !== "meal" && roles.slice(i + 1).includes("meal")
      )
    );
    /*
     * What each slot could swap to, kept before an event takes its slot over.
     * The event is chosen for the plan, not by the person (most days carry a
     * Gaderin activity or two), so it must be swappable like any other stop:
     * an event's slot offered nothing, and was most of the Swap taps that
     * said "Nothing else fits here".
     */
    const swapPools = slots.slice();

    /*
     * The event's slot, and its venue nailed into it.
     *
     * Chosen by time rather than by kind of place: somebody planning around a
     * block party at seven means seven o'clock, and the slot that lands
     * nearest seven is the one the evening should spend there.
     *
     * Replacing the slot's whole option list rather than reordering it is what
     * makes the pin hold. Everything below, the walk down to fit the budget
     * and the climb back up to spend it, moves within a slot's own list, so a
     * list holding one venue can still trade a full order for a plainer one
     * and can never trade the venue away. The alternates offered on the card
     * come from the same list, so there is nothing to swap it for there
     * either, which is right: the event is the point of the evening.
     */
    /*
     * Into a stop that takes its kind of place, when the request named one.
     *
     * By time alone was right when an event was a block party somebody had
     * planned around. Since Gaderin, most days carry thirty standing
     * activities, so nearly every plan has an event to pin, and pinned by
     * time alone it took whatever stop was nearest: a business meeting asked
     * to be held in a cafe was sent bowling, and a couple who asked for a spa
     * first were sent to a pottery class. So: a stop of its own kind,
     * nearest in time, first. A meeting or a narrowed focus is held to that,
     * and so is a spa stop, which only ever holds a spa. An ordinary evening
     * with no stop of the event's kind falls back to the nearest in time, as
     * before.
     */
    let pinnedIndex = -1;
    if (pin) {
      const at = pin.at ?? startMinutes;
      const nearest = (fits: (role: Role) => boolean) => {
        let best = -1;
        let closest = Infinity;
        roles.forEach((role, i) => {
          if (!fits(role)) return;
          const gap = Math.abs(nominalStart(roles, i) - at);
          if (gap < closest) {
            closest = gap;
            best = i;
          }
        });
        return best;
      };
      // A film asked for goes in whatever stop is nearest its time, focus or not.
      const strict = pin.event.kind !== "movie" && (Boolean(meetingRole(inputs)) || focusTypes.length > 0);
      /*
       * Never the meal's stop while there is another. A cocktail class at a
       * restaurant and a Twi cafe night each took the dinner slot, priced by
       * the door alone, and the evening had no food in it (27 Oct 2026). The
       * roles were already turned round above so the slot nearest the event
       * is not the meal.
       */
      const notMeal = (role: Role) => role !== "meal" || roles.every((r) => r === "meal");
      pinnedIndex = nearest((role) => ROLE_TYPES[role].includes(pin.venue.type) && notMeal(role));
      if (pinnedIndex < 0 && !strict) pinnedIndex = nearest((role) => role !== "wellness" && notMeal(role));
    }
    if (pin && pinnedIndex >= 0) {
      const built = optionsForVenue(
        pin.venue,
        roles[pinnedIndex],
        nominalStart(roles, pinnedIndex),
        {
          // An event is the statement that the place is open and worth being
          // at that night. Opening hours on file are the ordinary week.
          ignoreHours: true,
          /*
           * The door price goes down with the request rather than being added
           * to the answer. It is what makes a venue with no menu plannable at
           * all: handed in here, a ticketed night is a price like any other
           * and the stop can be built from it. Bolted on afterwards, there was
           * nothing to bolt it to, because planOrders had already returned
           * null and the venue had no options to amend.
           *
           * Null rather than zero when nothing is recorded: zero is somebody
           * saying entry is free, which is a price.
           */
          ticket: pin.event.cost_ghs == null ? null : Number(pin.event.cost_ghs),
          event: true,
          // Our estimate for a seat and snacks, and the line says so.
          ...(pin.event.kind === "movie" ? { doorLabel: "Ticket and snacks (estimate)" } : {}),
        }
      );
      if (!built.length) return null;

      slots[pinnedIndex] = built.sort((a, b) => b.tier - a.tier || a.cost - b.cost);
    }

    // Start with each slot's most preferred option, skipping venues already
    // taken by an earlier slot. The pinned slot picks first, because it has
    // only the one venue to offer and an earlier slot taking it would fail the
    // whole attempt.
    const chosen = new Array<Option>(slots.length);
    const used = new Set<string>();
    const pickOrder = slots.map((_, i) => i);
    if (pinnedIndex >= 0) pickOrder.unshift(...pickOrder.splice(pinnedIndex, 1));
    for (const i of pickOrder) {
      const pick = slots[i].find((o) => !used.has(brandOf(o.venue)));
      if (!pick) return null;
      used.add(brandOf(pick.venue));
      chosen[i] = pick;
    }
    /*
     * An outing is at least two places, unless one was what was asked for.
     *
     * chosen is sized from the slots, so this was never a check that the slots
     * had filled -- the loop above already returns on the first one that
     * cannot -- it was a floor, and the third of three. A business meeting is
     * the one pathway where a single venue is the whole plan, so the floor
     * gives way to a stated answer and holds everywhere else.
     */
    if (chosen.length < (inputs.stops === 1 ? 1 : 2)) return null;

    const totalOf = (picks: Option[]) => {
      const stops = toStops(picks);
      const hops = hopsFor(stops, driving, cars);
      return (
        picks.reduce((s, p) => s + p.cost, 0) + hops.reduce((s, h) => s + h.cost_ghs, 0)
      );
    };

    /*
     * Fit by repeatedly taking the single biggest saving available anywhere in
     * the plan.
     *
     * Walking order tiers alone was not enough: it left an expensive venue in
     * place and only shrank its order, so a GHS 350-a-head restaurant kept a
     * 900 budget unreachable. Considering venue swaps and order tiers in the
     * same move fixes that, and taking the largest saving first means the plan
     * gives up as little of what was preferred as possible.
     */
    /*
     * Generous enough to walk the whole way down.
     *
     * This was forty, which was ample when a plan started at a typical order.
     * Starting at a full sit-down across five stops is a much longer descent,
     * and running out of moves mid-walk does not report a problem: the plan
     * simply fails, the caller tries one fewer stop, and somebody who asked
     * for five places is quietly given four.
     */
    for (let guard = 0; guard < 300; guard++) {
      const total = totalOf(chosen);
      if (total <= inputs.budget) break;

      /*
       * The smallest saving that actually closes the gap, not the largest one
       * on the table.
       *
       * Taking the biggest saving first overshoots, badly. Being fifty cedis
       * over budget would trigger a four-hundred-cedi downgrade because that
       * was the largest move available, and the loop then stopped, because it
       * only ever checked whether the plan fitted and never whether it had
       * given up more than it needed to. That is how a table for two at a
       * seventy-dish restaurant ended up with the two cheapest plates on the
       * menu while most of the budget went unspent.
       *
       * When nothing on offer closes the gap, the biggest saving is still the
       * right move: it is the one that makes the most progress towards a plan
       * that fits at all.
       */
      const shortfall = total - inputs.budget;
      let best: { index: number; option: Option; saving: number } | null = null;
      const consider = (c: { index: number; option: Option; saving: number }) => {
        if (!best) {
          best = c;
          return;
        }
        const bestEnough = best.saving >= shortfall;
        const thisEnough = c.saving >= shortfall;
        if (thisEnough && bestEnough) {
          if (c.saving < best.saving) best = c;
        } else if (thisEnough) {
          best = c;
        } else if (!bestEnough && c.saving > best.saving) {
          best = c;
        }
      };

      chosen.forEach((current, i) => {
        const taken = new Set(chosen.filter((_, j) => j !== i).map((c) => brandOf(c.venue)));
        for (const option of slots[i]) {
          if (taken.has(brandOf(option.venue))) continue;
          const saving = current.cost - option.cost;
          if (saving <= 0) continue;
          consider({ index: i, option, saving });
        }
      });

      const move = best as { index: number; option: Option; saving: number } | null;
      if (!move) return null; // Nothing left to give up.
      chosen[move.index] = move.option;
    }

    if (totalOf(chosen) > inputs.budget) return null;

    /*
     * Now spend what is left.
     *
     * A budget is what somebody is willing to spend, not a ceiling to creep
     * under. The walk-down above gives things up in order to make the evening
     * fit, and until now that was the end of it: whatever it had surrendered
     * stayed surrendered even when the plan came in hundreds of cedis short,
     * so the answer to "I have a thousand" could be two of the cheapest plates
     * in the building.
     *
     * So climb back. Each move restores something the sort already preferred
     * and that the remaining money covers, best first: a full order before a
     * better venue, because a bare order is the more obvious disappointment.
     * Every move costs strictly more than the one it replaces, so the headroom
     * only shrinks and this terminates.
     */
    /*
     * A bare order is the disappointment to climb out of first, so reaching a
     * typical one outweighs everything. A full sit-down over a typical order
     * is only spending what is left, worth two and a half points of fit: it
     * was a thousand, so a cheap place where three courses fitted beat every
     * better place where two did, and the same few cheap cafes and
     * restaurants took most stops.
     */
    const tierValue = (t: OrderTier) => (t === 0 ? 0 : t === 1 ? 1000 : 1025);
    const gainOf = (option: Option, current: Option) =>
      tierValue(option.tier) - tierValue(current.tier) + (option.score - current.score) * 10;

    for (let guard = 0; guard < 40; guard++) {
      const before = totalOf(chosen);
      if (before >= inputs.budget) break;

      let move: { index: number; option: Option; gain: number; extra: number } | null = null;

      chosen.forEach((current, i) => {
        const taken = new Set(chosen.filter((_, j) => j !== i).map((c) => brandOf(c.venue)));
        for (const option of slots[i]) {
          if (option === current || taken.has(brandOf(option.venue))) continue;

          const gain = gainOf(option, current);
          if (gain <= 0) continue;

          /*
           * Priced as the whole evening, not as the difference between two
           * orders. A swap moves the stop as well as the order, and the taxi
           * to the new place is part of what it costs: judging the move on
           * food alone put a plan at GHS 1,225 against a budget of 1,200,
           * because the hop that grew was not in the sum being checked.
           */
          const trial = chosen.slice();
          trial[i] = option;
          const after = totalOf(trial);
          if (after > inputs.budget) continue;

          const extra = after - before;
          // An upgrade that also costs less would already have been taken on
          // the way down.
          if (extra <= 0) continue;

          if (!move || gain > move.gain || (gain === move.gain && extra > move.extra)) {
            move = { index: i, option, gain, extra };
          }
        }
      });

      const up = move as { index: number; option: Option; gain: number; extra: number } | null;
      if (!up) break;
      chosen[up.index] = up.option;
    }

    /*
     * Tighten the route.
     *
     * Every slot above picks its own best venue with no idea where the stop
     * before it was, and the budget walk compares venues on their own prices,
     * never on the rides they create. So four individually sensible choices
     * came out as Labone, then East Legon, then Cantonments -- next door to
     * Labone -- and then back to East Legon: most of the evening in a taxi,
     * paid for out of the budget.
     *
     * So, last: swap any stop for a nearby alternative from its own slot, but
     * only one that fits as well -- within a point of the same score, never a
     * plainer order -- still inside the budget, and at least two kilometres
     * shorter to reach and leave. Those conditions are what stop this from
     * trading the dinner somebody's evening was built around for a worse one
     * two streets away. Stops keep their order, because the order is the
     * shape of the evening: dinner does not move behind dessert to save a
     * ride. Repeated until nothing moves, because pulling one stop in can
     * make its neighbour the next thing out of place.
     */
    /*
     * Judged on the whole route, not one stop's two legs.
     *
     * The first version compared a stop's own legs and nothing else, and it
     * cut distance by a third while creating the very shape it existed to
     * remove: pulling three stops into East Legon and leaving one stranded in
     * Achimota between them. Each swap looked shorter locally; together they
     * made East Legon, Achimota, East Legon.
     *
     * So a swap is weighed against the entire route, and it may never add a
     * return to an area already left. Shorter is only better when it is not
     * also a detour back.
     */
    const revisitsOf = (picks: Option[]) => {
      let n = 0;
      const left = new Set<string>();
      for (let i = 1; i < picks.length; i++) {
        const prev = picks[i - 1].venue.area_id;
        if (picks[i].venue.area_id !== prev) left.add(prev);
        if (left.has(picks[i].venue.area_id)) n++;
      }
      return n;
    };
    const routeKm = (picks: Option[]) =>
      picks.reduce((sum, p, i) => (i ? sum + kmBetween(picks[i - 1].venue, p.venue) : 0), 0);

    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (let i = 0; i < chosen.length; i++) {
        if (i === pinnedIndex) continue;
        const current = chosen[i];
        const taken = new Set(chosen.filter((_, j) => j !== i).map((c) => brandOf(c.venue)));
        const kmNow = routeKm(chosen);
        const backNow = revisitsOf(chosen);
        let best: { option: Option; km: number; back: number } | null = null;
        for (const option of slots[i]) {
          if (option === current || taken.has(brandOf(option.venue))) continue;
          if (option.tier < current.tier) continue;
          const trial = chosen.slice();
          trial[i] = option;
          const back = revisitsOf(trial);
          if (back > backNow) continue;
          /*
           * A little more latitude when the swap removes a detour back. Two
           * points is still inside the preference for the right kind of place
           * (worth two on its own), so this never turns a dinner slot into a
           * bar to save a ride, but it lets a near-equal venue in the right
           * area beat a marginally better one on the wrong side of town.
           */
          /*
           * And more again when this stop's ride is long: an evening across
           * town was the usual shape of a plan from nowhere in particular,
           * with 29 of the 31 rides over 10 km in a fortnight (28 Oct 2026).
           * A stop more than 8 km from a neighbour may give up three points
           * for one within 6 km of both.
           */
          const legs = (o: Option) =>
            Math.max(i > 0 ? kmBetween(chosen[i - 1].venue, o.venue) : 0, i < chosen.length - 1 ? kmBetween(o.venue, chosen[i + 1].venue) : 0);
          const nearer = legs(current) > 8 && legs(option) <= 6;
          if (option.score < current.score - (nearer ? 3 : back < backNow ? 2 : 1)) continue;
          const km = routeKm(trial);
          // Fewer returns always wins; otherwise it has to be a real saving.
          if (back === backNow && km > kmNow - 2) continue;
          if (totalOf(trial) > inputs.budget) continue;
          if (!best || back < best.back || (back === best.back && km < best.km)) best = { option, km, back };
        }
        if (best) {
          chosen[i] = best.option;
          moved = true;
        }
      }
      if (!moved) break;
    }

    // What the finished plan leaves unspent, so a swap may use it (see toStops).
    /**
     * The stops, their rides and their real times, from what is chosen.
     *
     * Never turn up before the doors open: arrival times are laid out from
     * the start of the evening, so the stop that exists because of an event
     * can land before the event does. That stop is pushed to the hour it
     * starts and everything after it moves along, which reads as a longer
     * dinner beforehand rather than an hour standing outside.
     */
    const lay = () => {
      // What the finished plan leaves unspent, so a swap may use it (see toStops).
      const headroom = Math.max(0, inputs.budget - totalOf(chosen));
      const laid = toStops(chosen, headroom);
      const rides = hopsFor(laid, driving, cars);
      schedule(laid, startMinutes, rides);
      if (pinnedIndex >= 0 && pin?.at != null) {
        const early = pin.at - laid[pinnedIndex].arrivalMinutes;
        if (early > 0) {
          for (let i = pinnedIndex; i < laid.length; i++) laid[i].arrivalMinutes += early;
        }
        /*
         * And never after a film has started. Arriving at 18:43 for 18:40
         * is missing the opening, so the stop before gives up the minutes,
         * down to a forty-minute floor; past that the attempt fails below
         * and a plan with fewer stops, or none of the film, is tried.
         */
        const late = laid[pinnedIndex].arrivalMinutes - pin.at;
        const before = laid[pinnedIndex - 1];
        if (pin.event.kind === "movie" && late > 0 && before && before.durationMins - late >= 40) {
          before.durationMins -= late;
          for (let i = pinnedIndex; i < laid.length; i++) laid[i].arrivalMinutes -= late;
        }
      }
      return { stops: laid, hops: rides };
    };
    let { stops, hops } = lay();
    const filmMissed = () =>
      pinnedIndex >= 0 && pin?.event.kind === "movie" && pin.at != null && stops[pinnedIndex].arrivalMinutes > pin.at;
    if (filmMissed()) return null;

    /*
     * Open when they actually get there.
     *
     * Every venue was checked against its slot's nominal time, which allows a
     * short ride between stops. Real rides can be far longer (La to Aburi is
     * an hour and three quarters), and a plan sent four friends to Kwame
     * Nkrumah Memorial Park at 9:17 PM, two hours after it shut. So, with the
     * real times laid out, a stop that would be closed is replaced by the
     * slot's best option that is open then and still fits the budget, and the
     * times are laid out again. When nothing in the slot is open, this many
     * stops do not work tonight and the caller tries one fewer. Unknown hours
     * stay assumed open, as everywhere else; the event's stop is the event's
     * own night and is left alone.
     */
    if (weekday !== null) {
      for (let pass = 0; pass < chosen.length; pass++) {
        const shut = stops.findIndex(
          (st, i) =>
            i !== pinnedIndex &&
            isOpenThroughout(parsePeriods(st.venue.opening_periods), weekday, st.arrivalMinutes, st.durationMins) === false
        );
        if (shut < 0) break;
        const at = stops[shut].arrivalMinutes;
        const others = new Set(chosen.filter((_, j) => j !== shut).map((o) => brandOf(o.venue)));
        const instead = slots[shut].find(
          (o) =>
            !others.has(brandOf(o.venue)) &&
            isOpenThroughout(parsePeriods(o.venue.opening_periods), weekday, at, stops[shut].durationMins) !== false &&
            totalOf(chosen.map((x, j) => (j === shut ? o : x))) <= inputs.budget
        );
        if (!instead) return null;
        chosen[shut] = instead;
        ({ stops, hops } = lay());
        if (filmMissed()) return null;
      }
      if (
        stops.some(
          (st, i) =>
            i !== pinnedIndex &&
            isOpenThroughout(parsePeriods(st.venue.opening_periods), weekday, st.arrivalMinutes, st.durationMins) === false
        )
      )
        return null;
    }

    /*
     * And no long ride across town for the last stop late at night (the plan
     * check's other repeat). After ten, a last stop more than 5 km from the
     * one before is swapped for the slot's best option within 5 km that is
     * open then and still fits, if there is one. Not the event's stop, which
     * is the reason for the night.
     */
    {
      const last = stops.length - 1;
      if (last > 0 && last !== pinnedIndex && stops[last].arrivalMinutes >= 22 * 60 && kmBetween(stops[last - 1].venue, stops[last].venue) > 5) {
        const prev = stops[last - 1].venue;
        const at = stops[last].arrivalMinutes;
        const others = new Set(chosen.filter((_, j) => j !== last).map((o) => brandOf(o.venue)));
        const nearer = slots[last].find(
          (o) =>
            !others.has(brandOf(o.venue)) &&
            kmBetween(prev, o.venue) <= 5 &&
            (weekday === null || isOpenThroughout(parsePeriods(o.venue.opening_periods), weekday, at, stops[last].durationMins) !== false) &&
            totalOf(chosen.map((x, j) => (j === last ? o : x))) <= inputs.budget
        );
        if (nearer) {
          chosen[last] = nearer;
          ({ stops, hops } = lay());
        }
      }
    }

    /*
     * Once the times are known, two things only the whole plan can see.
     *
     * One dessert course an evening. A meal followed by any stop that orders
     * dessert (a dessert stop, or a restaurant standing in for something to
     * do) gives its own dessert up: an anniversary had creme brulee at
     * dinner and brownies at the next stop (27 Oct 2026). Its swaps do too,
     * and the service charge and VAT come down with the bill.
     *
     * And a meal is named for when they sit down: lunch at two was headed
     * DINNER. The slot's nominal time named it first; the arrival is exact.
     */
    {
      const noDessert = <T extends { venue: Venue; orders: ItineraryOrder[]; cost: number; charges: StopCharge[] }>(x: T): T => {
        const keep = x.orders.filter((o) => !isDessertAt(x.venue, o.item));
        if (!keep.length || keep.length === x.orders.length) return x;
        const cut = x.orders.reduce((n, o) => n + (keep.includes(o) ? 0 : o.price_ghs), 0);
        const door = x.orders.reduce((n, o) => n + (o.door ? o.price_ghs : 0), 0);
        const subtotal = x.cost - chargesTotal(x.charges) - door - cut;
        const charges = chargesOn(subtotal, { service_pct: x.venue.service_charge_pct, tax_pct: x.venue.tax_added_pct });
        return { ...x, orders: keep, charges, cost: subtotal + chargesTotal(charges) + door };
      };
      const MEALTIMES = new Set(["BREAKFAST", "BRUNCH", "LUNCH", "DINNER"]);
      const named = (label: string, at: number) => (MEALTIMES.has(label) ? roleLabel("meal", at) : label);
      const sweet = stops.map((st) => st.venue.type === "dessert" || st.orders.some((o) => isDessertAt(st.venue, o.item)));
      stops = stops.map((st, i) => {
        const after = st.role === "meal" && sweet.slice(i + 1).some(Boolean);
        const own = after ? noDessert(st) : st;
        return {
          ...own,
          label: named(st.label, st.arrivalMinutes),
          alternates: st.alternates.map((a) => ({ ...(after ? noDessert(a) : a), label: named(a.label, st.arrivalMinutes) })),
        };
      });

      /*
       * And no kind of dish twice in one outing. Eggs at the café and eggs
       * again at lunch read as a mistake (owner, 27 Oct 2026). A later stop
       * that orders a kind an earlier one served is ordered again steering
       * clear of it, at the same tier, when the new bill fits what is left
       * of the budget and the repeat actually goes. Not a stop standing in
       * for another kind, whose heading follows what it ordered, nor the
       * event's.
       */
      const PLAIN = new Set(["other", "side_starch", "bread", "vegetables"]);
      const kindsOf = (st: PlannedStop) => {
        const menu = menuByVenue.get(st.venue.id) ?? [];
        const kinds = new Set<string>();
        for (const o of st.orders) {
          if (o.door) continue;
          const m = menu.find((x) => x.name === o.item);
          if (m?.dish_type && !PLAIN.has(m.dish_type) && m.category !== "drink" && m.dish_role !== "drink") kinds.add(m.dish_type);
        }
        return kinds;
      };
      let spare = inputs.budget - stops.reduce((n, x) => n + x.cost, 0) - hops.reduce((n, h) => n + h.cost_ghs, 0);
      const served = new Set<string>();
      stops = stops.map((st, i) => {
        const role = roles[i];
        const mine = kindsOf(st);
        let out = st;
        if (
          [...mine].some((k) => served.has(k)) &&
          i !== pinnedIndex &&
          !st.event &&
          !standIn(role, st.venue.type) &&
          (st.basis ?? "menu") === "menu" &&
          st.tier != null
        ) {
          const planned = planOrders(
            st.venue,
            venueMenu(st.venue),
            inputs.partySize,
            st.tier,
            st.durationMins,
            st.arrivalMinutes,
            inputs.cuisines ?? [],
            wellnessKindsOf(inputs),
            weekdayOf(inputs.date),
            inputs.occasion === "family_day",
            {
              occasion: inputs.occasion,
              noDessert: roles.slice(i + 1).includes("dessert") || sweet.slice(i + 1).some(Boolean),
              meal: role === "meal",
              avoidTypes: [...served],
            }
          );
          if (planned && (planned.basis ?? "menu") === "menu") {
            const doors = st.orders.filter((o) => o.door);
            const charges = chargesOn(planned.cost, { service_pct: st.venue.service_charge_pct, tax_pct: st.venue.tax_added_pct });
            const next: PlannedStop = {
              ...st,
              orders: [...planned.orders, ...doors],
              charges,
              cost: planned.cost + chargesTotal(charges) + doors.reduce((n, o) => n + o.price_ghs, 0),
            };
            const repeats = [...kindsOf(next)].some((k) => served.has(k));
            if (!repeats && next.cost - st.cost <= Math.max(0, spare)) {
              spare -= next.cost - st.cost;
              out = next;
            }
          }
        }
        kindsOf(out).forEach((k) => served.add(k));
        return out;
      });
    }

    const foodTotal = stops.reduce((s, x) => s + x.cost, 0);
    const transportTotal = hops.reduce((s, h) => s + h.cost_ghs, 0);

    /*
     * A total is only exact when every stop was priced from something real.
     * One estimated stop makes the whole figure approximate, so the range
     * widens by that stop's own spread and the plan stops claiming precision
     * it does not have. Transport was always an estimate and is not counted
     * here, because it is described as an estimate on the card already.
     */
    const estimatedStops = stops.filter((x) => x.venue.price_source === "estimated" || x.venue.estimate);
    /*
     * A place with no menu (Venue.estimate) is budgeted at the top of its
     * range, so it can only come in under: the range reaches down by the
     * difference and not up.
     */
    const under = (x: PlannedStop) =>
      x.venue.estimate ? x.cost * (1 - x.venue.estimate.low / x.venue.estimate.high) : x.cost * Number(x.venue.price_spread ?? 0.3);
    const over = (x: PlannedStop) => (x.venue.estimate ? 0 : x.cost * Number(x.venue.price_spread ?? 0.3));
    const confidence: PriceConfidence = {
      exact: estimatedStops.length === 0,
      low: Math.round(foodTotal + transportTotal - estimatedStops.reduce((sum, x) => sum + under(x), 0)),
      high: Math.round(foodTotal + transportTotal + estimatedStops.reduce((sum, x) => sum + over(x), 0)),
      estimatedStops: estimatedStops.map((x) => x.venue.name),
    };

    return {
      stops,
      hops,
      foodTotal,
      transportTotal,
      total: foodTotal + transportTotal,
      confidence,
      trimmed: chosen.some((c) => c.tier === 0) || stopCount < stopCountFor(inputs.hours, focusesOf(inputs), inputs.vibes, inputs.stops),
    };

    /*
     * Calling a restaurant "SOMETHING TO DO" because the activity slot had
     * nothing to fill it reads as a mistake, so the venue's own type wins
     * whenever the slot fell back. A place standing in for something to do is
     * named for what it is there for: dessert when that is what was ordered.
     * A meal is named for the hour wherever it is had, since a meal stop
     * always has food on it (planOrders, opts.meal).
     */
    // A declaration, like toStops: both sit after attempt's return and are only reached by hoisting.
    function headingFor(role: Role, i: number, venue: Venue, orders: ItineraryOrder[]): string {
      if (
        ROLE_TYPES[role].includes(venue.type) ||
        (role === "meal" && FALLBACK_TYPES.meal.includes(venue.type)) ||
        (role !== "activity" && standIn(role, venue.type))
      )
        return roleLabel(role, nominalStart(roles, i));
      if (role === "activity" && orders.some((o) => isDessertAt(venue, o.item))) return "DESSERT";
      return TYPE_LABEL[venue.type] ?? ROLE_LABEL[role];
    }

    /*
     * Swapping a film is choosing another film (owner, 28 Oct 2026: "I keep
     * getting the same movie"). The stop's runners-up were the slot's other
     * venues, a dessert place or a café, so a swap left the cinema and the
     * next one came back to the same title. Now they are the other films
     * showing from half an hour before this one to two hours after, one
     * showing each, nearest first and this cinema first: the same ticket
     * estimate, each with its own start time on the card.
     */
    function filmSwaps(p: Option, film: EventRow): PlannedStop["alternates"] {
      const at = film.start_time ? minutesOf(film.start_time) : null;
      const byId = new Map(candidates.venues.map((v) => [v.id, v]));
      const seen = new Set([film.title.toLowerCase()]);
      return candidates.events
        .filter((e) => e.kind === "movie" && e.id !== film.id && e.venue_id && byId.has(e.venue_id) && e.start_time)
        .map((e) => ({ e, off: at == null ? 0 : minutesOf(e.start_time!) - at }))
        .filter((x) => x.off >= -30 && x.off <= 120)
        .map((x) => ({ e: x.e, gap: Math.abs(x.off) }))
        .sort((a, b) => Number(b.e.venue_id === p.venue.id) - Number(a.e.venue_id === p.venue.id) || a.gap - b.gap)
        .filter((x) => {
          const t = x.e.title.toLowerCase();
          if (seen.has(t)) return false;
          seen.add(t);
          return true;
        })
        .slice(0, SWAP_OPTIONS)
        .map(({ e }) => ({
          venue: byId.get(e.venue_id!)!,
          orders: p.orders,
          cost: p.cost,
          charges: p.charges,
          label: e.title,
          event: {
            id: e.id,
            title: e.title,
            start_time: e.start_time,
            image_url: e.image_url ?? null,
            contact_phone: e.contact_phone ?? null,
            booking_url: e.booking_url ?? null,
            description: e.description ?? null,
            reservation_required: e.reservation_required ?? false,
            audience: e.audience ?? "everyone",
            organiser_name: e.organiser_name ?? null,
            organiser_logo_url: e.organiser_logo_url ?? null,
          },
        }));
    }

    function toStops(picks: Option[], headroom = 0): PlannedStop[] {
      return picks.map((p, i) => {
        const role = roles[i];
        const taken = new Set(picks.map((x) => brandOf(x.venue)));
        const onTonight = i === pinnedIndex && pin ? pin.event : null;
        return {
          venue: p.venue,
          role,
          fixtures: p.fixtures,
          event: onTonight
            ? {
                id: onTonight.id,
                title: onTonight.title,
                start_time: onTonight.start_time,
                image_url: onTonight.image_url ?? null,
                contact_phone: onTonight.contact_phone ?? null,
                booking_url: onTonight.booking_url ?? null,
                description: onTonight.description ?? null,
                reservation_required: onTonight.reservation_required ?? false,
                audience: onTonight.audience ?? "everyone",
                organiser_name: onTonight.organiser_name ?? null,
                organiser_logo_url: onTonight.organiser_logo_url ?? null,
              }
            : null,
          // An event is named for itself: it is what is happening, not a guess at what sort of stop this is.
          label: onTonight ? onTonight.title : headingFor(role, i, p.venue, p.orders),
          durationMins:
            onTonight?.kind === "movie" && onTonight.runtime_mins
              ? Math.round(onTonight.runtime_mins) + 20
              : roleMinutes(role),
          arrivalMinutes: 0,
          orders: p.orders,
          cost: p.cost,
          charges: p.charges,
          tier: p.tier,
          basis: p.basis ?? "menu",
          /*
           * Runners-up this slot could have had, for an instant swap, near the
           * stop they would replace. Price was once the only test, so a free
           * castle in Cape Coast was offered as the swap for an Osu stop; a
           * swap is the same evening with a different place in it.
           *
           * Two passes. First the ones that keep the whole plan inside the
           * budget (what it leaves unspent, not "no dearer than this stop",
           * which left half of all stops with nothing) within SWAP_RADIUS_KM.
           * Then, to fill the rest, a little over budget and a little further
           * (swapStretch, SWAP_FAR_KM). Measured on replayed real plans with
           * scripts/swap-check.ts.
           */
          alternates: onTonight?.kind === "movie" ? filmSwaps(p, onTonight) : (() => {
            const pool = swapPools[i].filter((o) => o.venue.id !== p.venue.id && !taken.has(brandOf(o.venue)));
            /*
             * Near the stop it replaces, or no further from where they are
             * coming from than this stop already is.
             *
             * Near the stop alone failed whenever the stop itself was far:
             * a 6 am Saturday sent somebody 25 km out to We-Ape's zipline,
             * and every other place open that early was more than 8 km from
             * the zipline, so Swap said "Nothing else fits here" on a plan
             * that was already making the trip. The neighbour is the stop
             * before, or after for the first one.
             */
            const from = picks[i - 1]?.venue ?? picks[i + 1]?.venue ?? null;
            const reach = from ? kmBetween(from, p.venue) : 0;
            const near = (o: Option, km: number) =>
              kmBetween(o.venue, p.venue) <= km || (from != null && kmBetween(o.venue, from) <= Math.max(km, reach));
            const strict = pool.filter((o) => o.cost <= p.cost + headroom + 1 && near(o, SWAP_RADIUS_KM));
            const loose = pool.filter((o) => o.cost <= p.cost + headroom + swapStretch(inputs.budget) && near(o, SWAP_FAR_KM));
            const list = [...strict, ...loose].filter((o, idx, arr) => arr.findIndex((x) => x.venue.id === o.venue.id) === idx);
            /*
             * The last of the four is kept for the best place with no menu,
             * when they asked for those (PlanInputs.estimates). In the plan
             * itself they seldom win a slot, being thinner on record, so the
             * swap is where somebody who switched them on finds them.
             */
            const guess = list.findIndex((o) => o.venue.estimate);
            if (guess >= SWAP_OPTIONS) list.splice(SWAP_OPTIONS - 1, 0, ...list.splice(guess, 1));
            return list;
          })()
            .slice(0, SWAP_OPTIONS)
            .map((o) => ({
              venue: o.venue,
              orders: o.orders,
              cost: o.cost,
              charges: o.charges,
              // The heading this venue would have had in this slot, so a swap changes it too.
              label: headingFor(role, i, o.venue, o.orders),
            })),
        };
      });
    }
  };

  /*
   * The floor is one when one is what was asked for.
   *
   * Everywhere else it stays two, because a two-stop evening walking down to a
   * single venue is how a budget failure used to become a plan that looked
   * deliberate. Only an explicit "just one place" opens the floor, and then it
   * is not a fallback, it is the request.
   */
  const floor = inputs.stops === 1 ? 1 : 2;
  const wanted = Math.min(
    stopCountFor(inputs.hours, focusesOf(inputs), inputs.vibes, inputs.stops),
    Math.max(floor, candidates.venues.length)
  );
  for (let count = wanted; count >= floor; count--) {
    const plan = attempt(count, anchor);
    if (plan) return plan;
  }

  /*
   * The night had something on and no evening could be built around it, most
   * likely because the venue is dearer than the budget allows once the rest of
   * the stops are paid for. An evening without the event beats no evening, so
   * try again without the pin rather than report that nothing fits.
   */
  if (anchor) {
    for (let count = wanted; count >= floor; count--) {
      const plan = attempt(count, null);
      if (plan) return plan;
    }
  }
  return null;
}

/** "17:30" + n minutes → "5:30 PM", for the itinerary's display times. */
export function clockFromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const am = h < 12;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}
