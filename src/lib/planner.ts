import type { Candidates } from "./matching";
import { dishMatchesCuisine } from "./cuisineDishes";
import { isDriving } from "./budget";
import { expandVibes, loungeFloor } from "./catalog";
import { isOpenAt, isOpenThroughout, parsePeriods, weekdayOf } from "./hours";
import { estimateHop } from "./transport";
import { schedulesDuring } from "./schedules";
import { WELLNESS_TREATMENT_MIN_GHS, wellnessAllowed } from "./planConstants";
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
  VenueType,
} from "./types";

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

function roleSequence(
  startHour: number,
  stopCount: number,
  focus: PlanFocus,
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
  if (focus !== "everything") {
    const base = FOCUS_ROLES[focus];
    return withLoungeFloor(
      Array.from({ length: stopCount }, (_, i) => base[i % base.length]),
      loungeFloor(vibes)
    );
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

  return withLoungeFloor(
    Array.from({ length: stopCount }, (_, i) => base[i % base.length]),
    loungeFloor(vibes)
  );
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
export function focusVenueTypes(focus: PlanFocus): VenueType[] {
  if (focus === "everything") return [];
  const types = new Set<VenueType>();
  FOCUS_ROLES[focus].forEach((role) => ROLE_TYPES[role].forEach((t) => types.add(t)));
  return [...types];
}

/** Two stops in a short window, four only when there is genuinely time. */
export function stopCountFor(
  hours: number,
  focus: PlanFocus = "everything",
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
  const crawl = focus === "drinks" || focus === "activities" || loungeFloor(vibes) >= 2;

  if (hours <= 2) return 2;
  if (hours <= 4) return crawl ? 4 : 3;
  if (hours <= 6) return crawl ? 5 : 4;
  return crawl ? 6 : 5;
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
function cuisineFit(v: Venue, want: PlanCuisine): boolean | null {
  if (want === "either") return true;
  // Only a kitchen can be the wrong cuisine. A bowling alley is neither.
  if (v.type !== "restaurant" && v.type !== "cafe") return true;
  if (!v.cuisine) return null;
  return v.cuisine === "both" || v.cuisine === want;
}

function scoreVenue(v: Venue, inputs: PlanInputs, wantedTags: string[]): number {
  const overlap = v.vibe_tags.filter((t) => wantedTags.includes(t)).length;
  const occasion = v.best_for.includes(inputs.occasion) ? 1 : 0;
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
  return (
    overlap * 3 +
    occasion * 2 +
    inArea +
    cuisine +
    specific +
    formalityScore(v, inputs.formality) +
    looksScore(v, inputs.occasion)
  );
}

/* ── orders ───────────────────────────────────────────────────────────── */

interface OrderPlan {
  orders: ItineraryOrder[];
  cost: number;
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
function drinkable(menu: MenuItem[], choice: PlanInputs["alcohol"]): MenuItem[] {
  if (choice !== "none") return menu;
  return menu.filter((m) =>
    m.category === "drink" ? m.is_alcoholic === false : m.is_alcoholic !== true
  );
}

const byPrice = (a: MenuItem, b: MenuItem) => Number(a.price_ghs) - Number(b.price_ghs);

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
function planOrders(
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
  wantedCuisines: string[] = []
): OrderPlan | null {
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
    if (m.min_players != null && partySize < m.min_players) return false;
    const covers = Math.max(1, m.covers_people ?? 1);
    if (covers === 1 && m.max_players != null && partySize > m.max_players) return false;
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
  const orderFrom = (category: string, people: number): OrderLine[] => {
    const all = menu.filter((m) => m.category === category && fitsParty(m)).sort(byPrice);
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
    const candidates = items.slice(from, from + WIDTH);

    const counts = new Map<string, { item: MenuItem; qty: number }>();
    let covered = 0;
    for (let i = 0; covered < people && i < people * 2 + WIDTH; i++) {
      const m = candidates[i % candidates.length];
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
    }));
  };

  const lines: OrderLine[] = [];

  if (venue.type === "restaurant" || venue.type === "cafe") {
    const mains = [
      () => orderFrom("main", partySize),
      () => orderFrom("other", partySize),
      () => orderFrom("starter", partySize),
    ].reduce<OrderLine[]>((found, next) => (found.length ? found : next()), []);

    /*
     * Courses around the mains, only at the fullest tier and only when there
     * are real mains to put them around. Without that guard a venue with no
     * main course falls back to ordering its starters as the main event, and
     * would then be served the same starters again as a first course.
     */
    const hasMains = menu.some((m) => m.category === "main");
    if (tier === 2 && hasMains) lines.push(...orderFrom("starter", partySize));

    lines.push(...mains);

    /*
     * A drink each at a typical order. Spread too, because a table of seven
     * does not order seven of the same thing to drink either.
     */
    if (tier >= 1) lines.push(...orderFrom("drink", partySize));
    if (tier === 2 && hasMains) lines.push(...orderFrom("dessert", partySize));
  } else if (venue.type === "dessert") {
    const sweet = orderFrom("dessert", partySize);
    lines.push(...(sweet.length ? sweet : orderFrom("other", partySize)));
  } else if (venue.type === "lounge") {
    const drinks = orderFrom("drink", partySize);
    lines.push(...(drinks.length ? drinks : orderFrom("other", partySize)));
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
      };
    }

    const each = Math.round(Number(venue.avg_cost_per_person_ghs));
    /*
     * Nothing priced at all. A venue flagged free is genuinely free and can
     * carry a stop at zero; one that simply has no prices on file is withheld,
     * because planning a free visit to somewhere that charges is how a plan
     * lies about what an evening costs.
     */
    if (each <= 0) {
      return venue.is_free ? { orders: [], cost: 0 } : null;
    }
    return {
      orders: [
        { item: "Typical spend, per person", qty: partySize, price_ghs: each * partySize },
      ],
      cost: each * partySize,
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
      };
    }
  }

  return { orders, cost };
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
  alternates: { venue: Venue; orders: ItineraryOrder[]; cost: number }[];
}

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
function hopsFor(stops: PlannedStop[], driving = false) {
  const hops = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i].venue;
    const b = stops[i + 1].venue;
    const est = estimateHop(a, b);
    hops.push({
      from: a.areas?.name ?? "",
      to: b.areas?.name ?? "",
      mins: est.mins,
      cost_ghs: driving ? 0 : est.cost_ghs,
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

export function planItinerary(
  inputs: PlanInputs,
  candidates: Candidates
): PlannedItinerary | null {
  const wantedTags = expandVibes(inputs.vibes);
  const menuByVenue = new Map<string, MenuItem[]>();
  candidates.menuItems.forEach((m) => {
    const list = menuByVenue.get(m.venue_id) ?? [];
    list.push(m);
    menuByVenue.set(m.venue_id, list);
  });

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
      // Earliest first, so a night with two of them anchors on the one the
      // evening reaches first rather than doubling back.
      .sort((a, b) => (a.at ?? startMinutes) - (b.at ?? startMinutes));

    return placeable[0] ?? null;
  })();

  /** Every way one slot could be filled, cheapest order first within a venue. */
  interface Option {
    venue: Venue;
    tier: OrderTier;
    orders: ItineraryOrder[];
    cost: number;
    score: number;
    /** Weekly fixtures on while the party is here. Usually none. */
    fixtures: VenueSchedule[];
  }

  /*
   * A narrowed focus was asked for explicitly, so its slots are filled only by
   * venues of the right type. The thin-catalogue fallback below is right when
   * we chose the shape ourselves, but applied here it answered "just drinks"
   * with three restaurants, which is not a thin answer to the question, it is
   * an answer to a different one.
   */
  const focusTypes = focusVenueTypes(inputs.focus);

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
    for (let i = 0; i < index; i++) t += ROLE_MINUTES[roles[i]] + TRAVEL_ALLOWANCE;
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
        ROLE_MINUTES[role]
      );
      if (open === false) return out;
    }

    const menu = drinkable(menuByVenue.get(venue.id) ?? [], inputs.alcohol);

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
      ROLE_MINUTES[role]
    );
    const score =
      scoreVenue(venue, inputs, wantedTags) +
      (fixtures.length ? (FIXTURE_WEIGHT[inputs.occasion] ?? 1) : 0);

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

    const door = fixtureCover + (ticket ?? 0);
    const doorTotal = Math.round(door * inputs.partySize);
    /*
     * Whether anybody has actually written the door price down.
     *
     * Kept apart from the figure itself, because zero and unknown are
     * different answers and only one of them is a price. A fixture with a null
     * cover is a fixture somebody recorded without saying what it costs, and
     * reading that as free is how a rooftop bar ends up in a plan at nothing.
     */
    const doorKnown = covers.length > 0 || ticket != null;

    const doorLabel = fixtures.length
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
          },
        ]
      : [];

    const priced: Option[] = [];

    for (const tier of [2, 1, 0] as const) {
      const planned = planOrders(
        venue,
        menu,
        inputs.partySize,
        tier,
        ROLE_MINUTES[role],
        slotStart,
        inputs.cuisines ?? []
      );
      if (!planned) continue;
      // Nothing to order and nothing to pay at the door is a free stop, and
      // only a venue recorded as free may be one.
      if (planned.cost <= 0 && doorTotal <= 0 && !venue.is_free) continue;
      priced.push({
        venue,
        tier,
        orders: [...planned.orders, ...doorLine],
        cost: planned.cost + doorTotal,
        fixtures,
        // Within a focus every venue is allowed, so nudge the slot towards
        // its own role to keep the evening varied rather than three of the
        // same thing.
        score: score + (roleTypes.includes(venue.type) ? 2 : 0),
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
     */
    if (!priced.length && doorKnown) {
      priced.push({
        venue,
        tier: 0,
        orders: doorLine,
        cost: doorTotal,
        fixtures,
        score: score + (roleTypes.includes(venue.type) ? 2 : 0),
      });
    }

    out.push(...priced);
    return out;
  };

  const optionsFor = (role: Role, slotStart: number): Option[] => {
    const roleTypes = ROLE_TYPES[role];

    /*
     * With a narrowed focus every slot may be filled by anything within that
     * focus, not only by its own role's type. The roles are there to vary the
     * evening, a meal, then something sweet, but "mostly food" must not fail
     * because the catalogue has no dedicated dessert parlour, and it must not
     * quietly reach outside the focus either. Preference for the exact role
     * type is applied in the sort below instead.
     */
    const pool = focusTypes.length
      ? candidates.venues.filter((v) => focusTypes.includes(v.type))
      : candidates.venues.filter((v) => roleTypes.includes(v.type));

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
        .flatMap((venue) => optionsForVenue(venue, role, slotStart))
        .sort((a, b) => b.score - a.score || b.tier - a.tier || a.cost - b.cost);

    const preferred = build(pool);

    // Inside a narrowed focus there is no wider pool to fall back to: reaching
    // outside it would answer a different question from the one asked.
    if (focusTypes.length) return preferred;

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
    const rest = build(candidates.venues.filter((v) => !roleTypes.includes(v.type)));
    return [...preferred, ...rest];
  };

  const attempt = (
    stopCount: number,
    pin: Anchor | null
  ): PlannedItinerary | null => {
    const roles = withWellness(
      roleSequence(startHour, stopCount, inputs.focus, inputs.vibes, meetingRole(inputs)),
      inputs
    );
    const slots = roles.map((role, i) => optionsFor(role, nominalStart(roles, i)));

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
    let pinnedIndex = -1;
    if (pin) {
      const at = pin.at ?? startMinutes;
      let closest = Infinity;
      roles.forEach((_, i) => {
        const gap = Math.abs(nominalStart(roles, i) - at);
        if (gap < closest) {
          closest = gap;
          pinnedIndex = i;
        }
      });

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
      const pick = slots[i].find((o) => !used.has(o.venue.id));
      if (!pick) return null;
      used.add(pick.venue.id);
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
      const hops = hopsFor(stops, driving);
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
        const taken = new Set(chosen.filter((_, j) => j !== i).map((c) => c.venue.id));
        for (const option of slots[i]) {
          if (taken.has(option.venue.id)) continue;
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
    const gainOf = (option: Option, current: Option) =>
      (option.tier - current.tier) * 1000 + (option.score - current.score) * 10;

    for (let guard = 0; guard < 40; guard++) {
      const before = totalOf(chosen);
      if (before >= inputs.budget) break;

      let move: { index: number; option: Option; gain: number; extra: number } | null = null;

      chosen.forEach((current, i) => {
        const taken = new Set(chosen.filter((_, j) => j !== i).map((c) => c.venue.id));
        for (const option of slots[i]) {
          if (option === current || taken.has(option.venue.id)) continue;

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

    const stops = toStops(chosen);
    const hops = hopsFor(stops, driving);
    schedule(stops, startMinutes, hops);

    /*
     * Never turn up before the doors open.
     *
     * Arrival times are laid out from the start of the evening, so the stop
     * that exists because of an event can land before the event does: a 6:00
     * PM arrival printed under a 7:00 PM block party is the plan contradicting
     * itself on one line. Push that stop to the hour it starts and carry
     * everything after it along, which reads as a longer dinner beforehand
     * rather than an hour spent standing outside.
     */
    if (pinnedIndex >= 0 && pin?.at != null) {
      const early = pin.at - stops[pinnedIndex].arrivalMinutes;
      if (early > 0) {
        for (let i = pinnedIndex; i < stops.length; i++) stops[i].arrivalMinutes += early;
      }
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
    const estimatedStops = stops.filter((x) => x.venue.price_source === "estimated");
    const spread = estimatedStops.reduce(
      (sum, x) => sum + x.cost * Number(x.venue.price_spread ?? 0.3),
      0
    );
    const confidence: PriceConfidence = {
      exact: estimatedStops.length === 0,
      low: Math.round(foodTotal + transportTotal - spread),
      high: Math.round(foodTotal + transportTotal + spread),
      estimatedStops: estimatedStops.map((x) => x.venue.name),
    };

    return {
      stops,
      hops,
      foodTotal,
      transportTotal,
      total: foodTotal + transportTotal,
      confidence,
      trimmed: chosen.some((c) => c.tier === 0) || stopCount < stopCountFor(inputs.hours, inputs.focus, inputs.vibes, inputs.stops),
    };

    function toStops(picks: Option[]): PlannedStop[] {
      return picks.map((p, i) => {
        const role = roles[i];
        const taken = new Set(picks.map((x) => x.venue.id));
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
                reservation_required: onTonight.reservation_required ?? false,
              }
            : null,
          // Calling a restaurant "SOMETHING TO DO" because the activity slot
          // had nothing to fill it reads as a mistake, so the venue's own type
          // wins whenever the slot fell back. An event outranks both: it is
          // the name of what is happening, not a guess at what sort of stop
          // this is.
          label: onTonight
            ? onTonight.title
            : ROLE_TYPES[role].includes(p.venue.type)
              ? ROLE_LABEL[role]
              : (TYPE_LABEL[p.venue.type] ?? ROLE_LABEL[role]),
          durationMins: ROLE_MINUTES[role],
          arrivalMinutes: 0,
          orders: p.orders,
          cost: p.cost,
          // Runners-up this slot could have had, for an instant swap. Only
          // ones that fit what is left of the budget, so a swap can never
          // push the plan over.
          alternates: slots[i]
            .filter((o) => !taken.has(o.venue.id) && o.cost <= p.cost + 1)
            .filter(
              (o, idx, arr) => arr.findIndex((x) => x.venue.id === o.venue.id) === idx
            )
            .slice(0, 2)
            .map((o) => ({ venue: o.venue, orders: o.orders, cost: o.cost })),
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
    stopCountFor(inputs.hours, inputs.focus, inputs.vibes, inputs.stops),
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
