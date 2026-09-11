import type { Candidates } from "./matching";
import { estimateHop } from "./transport";
import type {
  Formality,
  PriceConfidence,
  ItineraryOrder,
  MenuItem,
  PlanFocus,
  PlanInputs,
  PriceBand,
  Venue,
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
type Role = "meal" | "cafe" | "activity" | "lounge" | "dessert";

const ROLE_TYPES: Record<Role, VenueType[]> = {
  meal: ["restaurant"],
  cafe: ["cafe"],
  activity: ["activity", "outdoor"],
  lounge: ["lounge"],
  dessert: ["dessert"],
};

/** Typical time spent, before travel. */
const ROLE_MINUTES: Record<Role, number> = {
  meal: 80,
  cafe: 60,
  activity: 90,
  lounge: 75,
  dessert: 45,
};

/** Used when a slot falls back to a venue of another type. */
const TYPE_LABEL: Record<string, string> = {
  restaurant: "A TABLE",
  cafe: "COFFEE",
  lounge: "DRINKS",
  dessert: "DESSERT",
  activity: "SOMETHING TO DO",
  outdoor: "OUTDOORS",
};

const ROLE_LABEL: Record<Role, string> = {
  meal: "DINNER",
  cafe: "COFFEE",
  activity: "SOMETHING TO DO",
  lounge: "DRINKS",
  dessert: "DESSERT",
};

/**
 * The shape of the outing, by when it starts.
 *
 * A plan beginning at 10am is not a shorter version of one beginning at 7pm,
 * so the sequence is chosen from the clock rather than scaled.
 */
function roleSequence(startHour: number, stopCount: number, focus: PlanFocus): Role[] {
  /*
   * A narrowed focus overrides the time of day entirely. Someone asking for
   * drinks wants a second bar, not dinner at the sensible hour for it, and
   * cycling the focus roles is what turns one request into a crawl.
   */
  if (focus !== "everything") {
    const base = FOCUS_ROLES[focus];
    return Array.from({ length: stopCount }, (_, i) => base[i % base.length]);
  }

  let base: Role[];
  if (startHour < 11) base = ["cafe", "activity", "meal", "dessert"];
  else if (startHour < 15) base = ["meal", "activity", "dessert", "lounge"];
  else if (startHour < 17) base = ["activity", "meal", "lounge", "dessert"];
  else base = ["meal", "activity", "lounge", "dessert"];
  return base.slice(0, stopCount);
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
export function stopCountFor(hours: number): number {
  if (hours <= 2) return 2;
  if (hours <= 4) return 3;
  if (hours <= 6) return 3;
  return 4;
}

const VIBE_ALIASES: Record<string, string[]> = {
  chill: ["calm", "casual"],
  beach: ["beach", "outdoorsy"],
  "club hopping": ["lively", "dancing"],
  dancing: ["dancing", "lively"],
  sporty: ["sporty", "adventurous"],
  picnic: ["picnic", "outdoorsy", "calm"],
  foodie: ["foodie"],
  artsy: ["artsy"],
};

function expandVibes(vibes: string[]): string[] {
  const out = new Set<string>();
  vibes.forEach((v) => (VIBE_ALIASES[v] ?? [v]).forEach((t) => out.add(t)));
  return Array.from(out);
}

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

function scoreVenue(v: Venue, inputs: PlanInputs, wantedTags: string[]): number {
  const overlap = v.vibe_tags.filter((t) => wantedTags.includes(t)).length;
  const occasion = v.best_for.includes(inputs.occasion) ? 1 : 0;
  const inArea = inputs.areaIds.includes(v.area_id) ? 1 : 0;
  return (
    overlap * 3 +
    occasion * 2 +
    inArea +
    formalityScore(v, inputs.formality) +
    looksScore(v, inputs.occasion)
  );
}

/* ── orders ───────────────────────────────────────────────────────────── */

interface OrderPlan {
  orders: ItineraryOrder[];
  cost: number;
}

const byPrice = (a: MenuItem, b: MenuItem) => Number(a.price_ghs) - Number(b.price_ghs);

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
  tier: 0 | 1,
  durationMins: number
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

  const pick = (category: string): MenuItem | null => {
    const items = menu.filter((m) => m.category === category).sort(byPrice);
    if (!items.length) return null;
    if (tier === 0) return items[0];
    // The median is a better "typical" than the mean, which one costly
    // item drags upward.
    return items[Math.floor(items.length / 2)];
  };

  const chosen: MenuItem[] = [];

  if (venue.type === "restaurant" || venue.type === "cafe") {
    const main = pick("main") ?? pick("other") ?? pick("starter");
    if (main) chosen.push(main);
    const drink = pick("drink");
    if (drink && tier === 1) chosen.push(drink);
  } else if (venue.type === "dessert") {
    const sweet = pick("dessert") ?? pick("other");
    if (sweet) chosen.push(sweet);
  } else if (venue.type === "lounge") {
    const drink = pick("drink") ?? pick("other");
    if (drink) chosen.push(drink);
  } else {
    // Activities and outdoor spots: one entry line per person.
    const entry = pick("other") ?? pick("main");
    if (entry) chosen.push(entry);
  }

  if (!chosen.length) {
    /*
     * The category we wanted is not on this menu, a restaurant listing only
     * drinks, say. Fall back to the cheapest thing it does sell before
     * falling back to the average, because reaching the average when the menu
     * is empty AND the average is zero produced a free stop, which is the
     * exact failure that made rooftop bars cost nothing.
     */
    const anything = [...menu].sort(byPrice)[0];
    if (anything) {
      const price = Math.round(Number(anything.price_ghs) * partySize);
      return {
        orders: [{ item: anything.name, qty: partySize, price_ghs: price }],
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

  const orders = chosen.map((m) => ({
    item: m.name,
    qty: partySize,
    price_ghs: Math.round(Number(m.price_ghs) * partySize),
  }));
  return { orders, cost: orders.reduce((s, o) => s + o.price_ghs, 0) };
}

/* ── planning ─────────────────────────────────────────────────────────── */

export interface PlannedStop {
  venue: Venue;
  role: Role;
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

function hopsFor(stops: PlannedStop[]) {
  const hops = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i].venue;
    const b = stops[i + 1].venue;
    const est = estimateHop(a, b);
    hops.push({
      from: a.areas?.name ?? "",
      to: b.areas?.name ?? "",
      mins: est.mins,
      cost_ghs: est.cost_ghs,
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

  const startMinutes = minutesOf(inputs.startTime);
  const startHour = Math.floor(startMinutes / 60);

  /** Every way one slot could be filled, cheapest order first within a venue. */
  interface Option {
    venue: Venue;
    tier: 0 | 1;
    orders: ItineraryOrder[];
    cost: number;
    score: number;
  }

  /*
   * A narrowed focus was asked for explicitly, so its slots are filled only by
   * venues of the right type. The thin-catalogue fallback below is right when
   * we chose the shape ourselves, but applied here it answered "just drinks"
   * with three restaurants, which is not a thin answer to the question, it is
   * an answer to a different one.
   */
  const focusTypes = focusVenueTypes(inputs.focus);

  const optionsFor = (role: Role): Option[] => {
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
      : (() => {
          const exact = candidates.venues.filter((v) => roleTypes.includes(v.type));
          // A thin catalogue should still produce a plan, so a slot with no
          // venue of its own type falls back to anything rather than
          // collapsing the evening.
          return exact.length ? exact : candidates.venues;
        })();

    const out: Option[] = [];
    for (const venue of pool) {
      const menu = menuByVenue.get(venue.id) ?? [];
      const score = scoreVenue(venue, inputs, wantedTags);
      for (const tier of [1, 0] as const) {
        const planned = planOrders(
          venue,
          menu,
          inputs.partySize,
          tier,
          ROLE_MINUTES[role]
        );
        if (!planned) continue;
        if (planned.cost <= 0 && !venue.is_free) continue;
        out.push({
          venue,
          tier,
          orders: planned.orders,
          cost: planned.cost,
          // Within a focus every venue is allowed, so nudge the slot towards
          // its own role to keep the evening varied rather than three of the
          // same thing.
          score: score + (roleTypes.includes(venue.type) ? 2 : 0),
        });
      }
    }
    /*
     * Preference, then a full order before a minimal one, then price.
     *
     * Sorting on price alone made the first pick the cheapest option in the
     * catalogue, so an ample budget still produced a bare plan. Tier now leads
     * price: start with what someone would actually order, and let the fitting
     * below strip it back only if the budget requires it.
     */
    return out.sort((a, b) => b.score - a.score || b.tier - a.tier || a.cost - b.cost);
  };

  const attempt = (stopCount: number): PlannedItinerary | null => {
    const roles = roleSequence(startHour, stopCount, inputs.focus);
    const slots = roles.map(optionsFor);

    // Start with each slot's most preferred option, skipping venues already
    // taken by an earlier slot.
    const chosen: Option[] = [];
    const used = new Set<string>();
    for (const options of slots) {
      const pick = options.find((o) => !used.has(o.venue.id));
      if (!pick) return null;
      used.add(pick.venue.id);
      chosen.push(pick);
    }
    if (chosen.length < 2) return null;

    const totalOf = (picks: Option[]) => {
      const stops = toStops(picks);
      const hops = hopsFor(stops);
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
    for (let guard = 0; guard < 40; guard++) {
      const total = totalOf(chosen);
      if (total <= inputs.budget) break;

      let best: { index: number; option: Option; saving: number } | null = null;
      const consider = (c: { index: number; option: Option; saving: number }) => {
        if (!best || c.saving > best.saving) best = c;
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

    const stops = toStops(chosen);
    const hops = hopsFor(stops);
    schedule(stops, startMinutes, hops);

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
      trimmed: chosen.some((c) => c.tier === 0) || stopCount < stopCountFor(inputs.hours),
    };

    function toStops(picks: Option[]): PlannedStop[] {
      return picks.map((p, i) => {
        const role = roles[i];
        const taken = new Set(picks.map((x) => x.venue.id));
        return {
          venue: p.venue,
          role,
          // Calling a restaurant "SOMETHING TO DO" because the activity slot
          // had nothing to fill it reads as a mistake, so the venue's own type
          // wins whenever the slot fell back.
          label: ROLE_TYPES[role].includes(p.venue.type)
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

  const wanted = Math.min(stopCountFor(inputs.hours), Math.max(2, candidates.venues.length));
  for (let count = wanted; count >= 2; count--) {
    const plan = attempt(count);
    if (plan) return plan;
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
