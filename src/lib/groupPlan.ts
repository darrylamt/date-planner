import {
  avoidHit,
  drinkable,
  orderRulesFor,
  planItinerary,
  planOrders,
  type OrderTier,
  type PlanOptions,
  type PlannedItinerary,
  type PlannedStop,
} from "./planner";
import type { Candidates } from "./matching";
import { chargesOn, chargesTotal } from "./budget";
import { weekdayOf } from "./hours";
import type { HardNo, MemberOrder, PersonalStopOrder } from "./groups";
import type { Itinerary, ItineraryOrder, MenuItem, PlanInputs, StopCharge, Venue } from "./types";

/**
 * One plan for a group, with each person's order sized to their own budget.
 *
 * Server-side only: it imports the planner, and it is the one place budgets
 * are read. Nothing it returns for the group as a whole carries a budget or
 * anybody's personal order; those go out one member at a time.
 *
 * How it works:
 *   1. Plan a shared skeleton with the existing planner, as if the whole
 *      group had the lowest budget each. The venues, the route and anything
 *      everyone pays then fit the person with least to spend.
 *   2. Split each stop into what is shared (entry, a court, a ticket, an
 *      activity everyone does, the rides) and what is personal (food and
 *      drink at a restaurant, café, lounge or dessert place).
 *   3. Share the shared money equally; deal each person's own order alone,
 *      choosing the fullest order their own budget allows.
 */

export interface GroupPerson {
  memberId: string;
  name: string;
  budget: number;
  nos: Set<HardNo>;
}

export interface SharedStopCost {
  stopIndex: number;
  /** Whether people order for themselves here. */
  personal: boolean;
  lines: ItineraryOrder[];
  charges: StopCharge[];
  total_ghs: number;
}

export type GroupPlanOutcome =
  | {
      status: "ok";
      skeleton: PlannedItinerary;
      shared: SharedStopCost[];
      rides_ghs: number;
      members: Map<string, MemberOrder>;
    }
  | { status: "no_fit"; reason: "venues" | "budgets" };

/* ── what each person can eat and drink ───────────────────────────────── */

const SEAFOOD =
  /\b(sea ?food|fish|tilapia|salmon|tuna|prawns?|shrimps?|crabs?|lobsters?|calamari|squid|octopus|oysters?|mussels?|clams?|sushi|sashimi|snapper|grouper|mackerel|anchov(y|ies)|kingfish)\b/i;
const PORK = /\b(pork|bacon|ham|pepperoni|salami|prosciutto|chorizo|pancetta)\b/i;

function dishOk(m: MenuItem, nos: Set<HardNo>): boolean {
  const text = `${m.name} ${m.notes ?? ""}`;
  // Gemini's tags too (0096), for the dishes whose names do not say.
  const tags = m.dish_tags ?? [];
  if (nos.has("no_seafood") && (SEAFOOD.test(text) || tags.includes("fish") || tags.includes("seafood"))) return false;
  if (nos.has("no_pork") && (PORK.test(text) || tags.includes("pork"))) return false;
  return true;
}

/** A venue's menu as one person may order from it. */
export function menuFor(menu: MenuItem[], nos: Set<HardNo>, alcohol: PlanInputs["alcohol"]): MenuItem[] {
  return drinkable(menu, nos.has("no_alcohol") ? "none" : alcohol).filter((m) => dishOk(m, nos));
}

/* ── which venues the group refuses ───────────────────────────────────── */

const VENUE_RULES: Partial<Record<HardNo, (v: Venue) => boolean>> = {
  no_clubs: (v) =>
    v.type === "lounge" &&
    (v.vibe_tags.includes("dancing") || /\b(night)?club\b/i.test(`${v.name} ${v.description ?? ""}`)),
  no_loud_music: (v) => avoidHit(v, "loud music"),
  no_smoke: (v) => avoidHit(v, "smoke"),
  no_long_walks: (v) => avoidHit(v, "long walks"),
};

/** Where people order for themselves. Everywhere else, everyone pays the same. */
const PERSONAL_TYPES = new Set(["restaurant", "cafe", "lounge", "dessert"]);

/**
 * The candidates with every venue somebody refuses taken out, and every
 * place to eat or drink that cannot serve each person something they will
 * have. A hard no is a filter, not a preference: the planner's own avoid is a
 * score, and a score can lose.
 */
export function filterForGroup(candidates: Candidates, people: GroupPerson[], alcohol: PlanInputs["alcohol"]): Candidates {
  const nos = new Set<HardNo>();
  for (const p of people) for (const id of p.nos) nos.add(id);
  const menus = new Map<string, MenuItem[]>();
  for (const m of candidates.menuItems) menus.set(m.venue_id, [...(menus.get(m.venue_id) ?? []), m]);

  const venues = candidates.venues.filter((v) => {
    for (const id of nos) if (VENUE_RULES[id]?.(v)) return false;
    const menu = menus.get(v.id) ?? [];
    if (PERSONAL_TYPES.has(v.type) && menu.length) {
      for (const p of people) {
        const mine = menuFor(menu, p.nos, alcohol);
        const enough = v.type === "lounge" ? mine.some((m) => m.category === "drink") : mine.some((m) => m.category !== "drink");
        if (!enough) return false;
      }
    }
    return true;
  });
  const ids = new Set(venues.map((v) => v.id));
  return {
    ...candidates,
    venues,
    menuItems: candidates.menuItems.filter((m) => ids.has(m.venue_id)),
    events: candidates.events.filter((e) => !e.venue_id || ids.has(e.venue_id)),
    schedules: candidates.schedules.filter((s) => ids.has(s.venue_id)),
  };
}

/* ── shared and personal money ────────────────────────────────────────── */

function isPersonalStop(stop: PlannedStop): boolean {
  return (
    (stop.basis ?? "menu") === "menu" &&
    PERSONAL_TYPES.has(stop.venue.type) &&
    (stop.venue.pricing_mode ?? "per_person") === "per_person"
  );
}

/** What everyone pays at a stop. At a personal stop that is only the door. */
export function splitStop(stop: PlannedStop, index: number, personal = isPersonalStop(stop)): SharedStopCost {
  if (personal) {
    const lines = stop.orders.filter((o) => o.door);
    return { stopIndex: index, personal, lines, charges: [], total_ghs: Math.round(lines.reduce((s, o) => s + o.price_ghs, 0)) };
  }
  return { stopIndex: index, personal, lines: stop.orders, charges: stop.charges, total_ghs: Math.round(stop.cost) };
}

/**
 * A total split as evenly as cedis allow. The odd cedis go to the people with
 * the most to spend, so the person with least is never tipped over by one.
 */
export function evenShares(total: number, people: GroupPerson[]): Map<string, number> {
  const n = people.length;
  const whole = Math.round(total);
  const base = Math.floor(whole / n);
  let extra = whole - base * n;
  const out = new Map<string, number>();
  const richestFirst = [...people].sort((a, b) => b.budget - a.budget);
  for (const p of richestFirst) {
    out.set(p.memberId, base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra -= 1;
  }
  return out;
}

interface PersonalOption {
  tier: OrderTier;
  preferred: boolean;
  orders: ItineraryOrder[];
  charges: StopCharge[];
  cost: number;
}

/** Same weights the planner uses to trade a fuller order against money. */
const tierValue = (t: OrderTier) => (t === 0 ? 0 : t === 1 ? 1000 : 1025);

/**
 * The orders one person could have at one stop: each tier, dealt from their
 * own place in the menu and from wherever is cheapest, so a person whose turn
 * lands on the dearest dish still has a way to fit.
 */
function optionsFor(
  stop: PlannedStop,
  menu: MenuItem[],
  seat: number,
  inputs: PlanInputs,
  // The plan's own rules for this stop (orderRulesFor), so a person's order is the course the plan meant.
  rules: Omit<NonNullable<Parameters<typeof planOrders>[10]>, "seat"> = {}
): PersonalOption[] {
  const out: PersonalOption[] = [];
  const seen = new Set<string>();
  const weekday = weekdayOf(inputs.date);
  const rates = { service_pct: stop.venue.service_charge_pct, tax_pct: stop.venue.tax_added_pct };
  const add = (o: PersonalOption) => {
    const key = JSON.stringify(o.orders.map((x) => [x.item, x.qty, x.price_ghs]));
    if (seen.has(key)) return;
    seen.add(key);
    out.push(o);
  };
  for (const tier of [2, 1, 0] as const) {
    let own: PersonalOption | null = null;
    let cheapest: PersonalOption | null = null;
    for (const s of [seat, 0, 1, 2, 3]) {
      const planned = planOrders(
        stop.venue, menu, 1, tier, stop.durationMins, stop.arrivalMinutes,
        inputs.cuisines ?? [], [], weekday, false, { ...rules, seat: s }
      );
      // Only a real order from the menu is personal; a fallback is a guess.
      if (!planned || (planned.basis ?? "menu") !== "menu") continue;
      const orders = planned.orders.filter((o) => !o.door);
      const subtotal = orders.reduce((sum, o) => sum + o.price_ghs, 0);
      const charges = chargesOn(subtotal, rates);
      const option = { tier, preferred: s === seat, orders, charges, cost: Math.round(subtotal + chargesTotal(charges)) };
      if (s === seat && !own) own = option;
      if (!cheapest || option.cost < cheapest.cost) cheapest = option;
    }
    if (own) add(own);
    if (cheapest) add(cheapest);
  }
  return out;
}

/**
 * The best set of orders, one per personal stop, that fits the allowance:
 * fullest orders first, then the person's own dishes over the cheapest, then
 * the one that uses more of what they set aside. At most six options at five
 * stops, so trying every combination is a few thousand sums.
 */
export function fitPerson(allowance: number, perStop: PersonalOption[][]): PersonalOption[] | null {
  let best: PersonalOption[] | null = null;
  let bestScore = -Infinity;
  const pick: PersonalOption[] = [];
  const walk = (i: number, spent: number) => {
    if (spent > allowance) return;
    if (i === perStop.length) {
      const score =
        pick.reduce((s, o) => s + tierValue(o.tier) * 1000 + (o.preferred ? 10 : 0), 0) + spent / 100000;
      if (score > bestScore) {
        bestScore = score;
        best = [...pick];
      }
      return;
    }
    for (const o of perStop[i]) {
      pick.push(o);
      walk(i + 1, spent + o.cost);
      pick.pop();
    }
  };
  walk(0, 0);
  return best;
}

/* ── the plan ─────────────────────────────────────────────────────────── */

const SHRINK = [1, 0.9, 0.8, 0.7];

export function planGroup(
  inputs: PlanInputs,
  candidates: Candidates,
  people: GroupPerson[],
  opts: PlanOptions = {}
): GroupPlanOutcome {
  const n = people.length;
  if (n < 2) return { status: "no_fit", reason: "budgets" };
  const filtered = filterForGroup(candidates, people, inputs.alcohol);
  const menus = new Map<string, MenuItem[]>();
  for (const m of filtered.menuItems) menus.set(m.venue_id, [...(menus.get(m.venue_id) ?? []), m]);
  const minB = Math.min(...people.map((p) => p.budget));
  const cars = Math.ceil(n / 4);

  for (const f of SHRINK) {
    const each = Math.floor((minB * f) / 50) * 50;
    const skeleton = planItinerary({ ...inputs, partySize: n, budget: each * n }, filtered, { cars, ...opts });
    if (!skeleton) {
      if (f === 1) return { status: "no_fit", reason: "venues" };
      break;
    }

    const personal = skeleton.stops.map(isPersonalStop);
    // Each person's options at each personal stop; a stop that cannot feed
    // somebody becomes shared at its planned price, split evenly.
    const options = new Map<string, Map<number, PersonalOption[]>>();
    for (const [idx, p] of people.entries()) {
      const mine = new Map<number, PersonalOption[]>();
      skeleton.stops.forEach((stop, i) => {
        if (!personal[i]) return;
        const rules = orderRulesFor(skeleton.stops, i, inputs.occasion, (id) => menus.get(id) ?? []);
        const opts_ = optionsFor(stop, menuFor(menus.get(stop.venue.id) ?? [], p.nos, inputs.alcohol), idx, inputs, rules);
        if (opts_.length) mine.set(i, opts_);
        else personal[i] = false;
      });
      options.set(p.memberId, mine);
    }

    const shared = skeleton.stops.map((stop, i) => splitStop(stop, i, personal[i]));
    const rides = Math.round(skeleton.transportTotal);
    const rideShare = evenShares(rides, people);
    const stopShares = shared.map((s) => evenShares(s.total_ghs, people));

    const members = new Map<string, MemberOrder>();
    let fits = true;
    for (const p of people) {
      const sharedMine = stopShares.reduce((s, m) => s + (m.get(p.memberId) ?? 0), 0);
      const rideMine = rideShare.get(p.memberId) ?? 0;
      const allowance = p.budget - sharedMine - rideMine;
      const personalIdx = skeleton.stops.map((_, i) => i).filter((i) => personal[i]);
      const perStop = personalIdx.map((i) => options.get(p.memberId)!.get(i)!);
      const chosen = allowance >= 0 ? fitPerson(allowance, perStop) : null;
      if (!chosen) {
        fits = false;
        break;
      }
      const stops: PersonalStopOrder[] = skeleton.stops.map((stop, i) => {
        const k = personalIdx.indexOf(i);
        const own = k >= 0 ? chosen[k] : null;
        return {
          stopIndex: i,
          venue_id: stop.venue.id,
          venue_name: stop.venue.name,
          orders: own?.orders ?? [],
          charges: own?.charges ?? [],
          shared_ghs: stopShares[i].get(p.memberId) ?? 0,
          personal_ghs: own?.cost ?? 0,
        };
      });
      const personalTotal = stops.reduce((s, x) => s + x.personal_ghs, 0);
      members.set(p.memberId, {
        stops,
        shared_ghs: sharedMine,
        personal_ghs: personalTotal,
        rides_ghs: rideMine,
        total_ghs: sharedMine + personalTotal + rideMine,
      });
    }
    if (!fits) continue;

    const outcome = { status: "ok" as const, skeleton, shared, rides_ghs: rides, members };
    if (groupViolations(outcome, people).length === 0) return outcome;
  }
  return { status: "no_fit", reason: "budgets" };
}

/** Everything that must hold before a group plan goes anywhere. Empty when it does. */
export function groupViolations(
  out: Extract<GroupPlanOutcome, { status: "ok" }>,
  people: GroupPerson[]
): string[] {
  const problems: string[] = [];
  const sharedTotals = people.map((p) => out.members.get(p.memberId)!.shared_ghs + out.members.get(p.memberId)!.rides_ghs);
  if (Math.max(...sharedTotals) - Math.min(...sharedTotals) > out.shared.length + 1) problems.push("shared shares differ");
  for (const p of people) {
    const m = out.members.get(p.memberId);
    if (!m) {
      problems.push(`no order for ${p.memberId}`);
      continue;
    }
    if (m.total_ghs > p.budget) problems.push(`over budget: ${p.memberId}`);
    for (const s of m.stops) {
      if (s.orders.some((o) => o.door)) problems.push(`door line in a personal order: ${p.memberId}`);
      if (s.orders.length && !out.shared[s.stopIndex].personal) problems.push(`personal order at a shared stop: ${p.memberId}`);
    }
  }
  return problems;
}

/**
 * The skeleton as the copy writer may see it: personal stops carry only what
 * everyone pays, so the words never name a dish that is not in anybody's own
 * order, nor hint at what one costs.
 */
export function planForCopy(out: Extract<GroupPlanOutcome, { status: "ok" }>): PlannedItinerary {
  return {
    ...out.skeleton,
    stops: out.skeleton.stops.map((s, i) => ({
      ...s,
      orders: out.shared[i].personal ? out.shared[i].lines : s.orders,
      charges: out.shared[i].personal ? [] : s.charges,
      cost: out.shared[i].total_ghs,
      alternates: [],
    })),
  };
}

export const GROUP_BUDGET_NOTE = "Works for everyone's budget. Each person sees their own order.";

/**
 * What everyone in the group may see: the venues, the times, what everyone
 * pays, and nothing personal. The total is what everyone pays plus the rides;
 * personal orders are added only in each person's own view.
 */
export function sharedItinerary(full: Itinerary, out: Extract<GroupPlanOutcome, { status: "ok" }>, code: string): Itinerary {
  const stops = full.stops.map((stop, i) => {
    const s = out.shared[i];
    return {
      ...stop,
      orders: s.personal ? s.lines : stop.orders,
      charges: s.personal ? [] : stop.charges,
      est_cost_ghs: s.total_ghs,
      alternates: [],
      ...(s.personal ? { own_orders: true } : {}),
    };
  });
  const food = out.shared.reduce((sum, s) => sum + s.total_ghs, 0);
  const { price_confidence: _dropped, ...rest } = full;
  void _dropped;
  return {
    ...rest,
    stops,
    food_total_ghs: food,
    transport_total_ghs: out.rides_ghs,
    est_total_ghs: food + out.rides_ghs,
    budget_note: GROUP_BUDGET_NOTE,
    group: { code },
  };
}
