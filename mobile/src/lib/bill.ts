import type { Itinerary, PlanInputs } from "./types";

/**
 * Splitting a bill: the plan's own orders, who had what, and who owes whom.
 *
 * The arithmetic is here, apart from the screen, so it can be reasoned about
 * (and checked) on its own. Everything is in whole cedis at the end, and the
 * pennies that rounding loses or gains land on whoever paid, so the shares
 * always add up to the bill.
 */

export interface BillLine {
  key: string;
  /** The stop it was ordered at. */
  stop: string;
  item: string;
  qty: number;
  ghs: number;
}

export interface BillSource {
  title: string;
  party: number;
  lines: BillLine[];
  /** Service charge and tax the plan added at each stop. */
  extras: { label: string; ghs: number }[];
  /** The rides between stops, all together. */
  rides: number;
}

/** What a plan hands to the split screen. In memory: it is one tap away. */
let source: BillSource | null = null;
export const setBillSource = (s: BillSource | null) => {
  source = s;
};
export const billSource = () => source;

export function billFromPlan(inputs: PlanInputs, itinerary: Itinerary): BillSource {
  const lines: BillLine[] = [];
  const extras: { label: string; ghs: number }[] = [];
  itinerary.stops.forEach((s, i) => {
    s.orders.forEach((o, j) => {
      if (o.qty <= 0 || o.price_ghs <= 0) return;
      lines.push({ key: `${i}-${j}`, stop: s.event?.title ?? s.name, item: o.door ? "Entry" : o.item, qty: o.qty, ghs: o.price_ghs });
    });
    for (const ch of s.charges ?? []) if (ch.ghs > 0) extras.push({ label: `${ch.label}, ${s.name}`, ghs: ch.ghs });
  });
  const rides = inputs.driving ? 0 : itinerary.hops.reduce((sum, h) => sum + (h.cost_ghs || 0), 0);
  return { title: itinerary.title, party: inputs.partySize, lines, extras, rides };
}

export interface SplitInput {
  people: number;
  mode: "even" | "items";
  lines: BillLine[];
  /** For each line, who shared it, by index. Missing means everybody. */
  sharedBy: Record<string, number[]>;
  extras: number;
  rides: number;
  includeRides: boolean;
  /** What the till actually said, for food, drink and charges. Null: the plan's figures. */
  actual: number | null;
  /** Who paid, whose share absorbs the rounding. */
  payer: number;
}

/** Each person's share, in whole cedis, adding up exactly to the total. */
export function splitBill(s: SplitInput): { shares: number[]; total: number } {
  const n = Math.max(1, s.people);
  const everyone = Array.from({ length: n }, (_, i) => i);
  const planned = s.lines.reduce((sum, l) => sum + l.ghs, 0) + s.extras;
  const bill = s.actual != null && s.actual > 0 ? s.actual : planned;
  const rides = s.includeRides ? s.rides : 0;

  let exact: number[];
  if (s.mode === "even" || !s.lines.length) {
    exact = everyone.map(() => bill / n);
  } else {
    // What each person had, then the charges and any difference at the till in proportion to it.
    const had = everyone.map(() => 0);
    for (const l of s.lines) {
      const who = (s.sharedBy[l.key] ?? everyone).filter((p) => p < n);
      const by = who.length ? who : everyone;
      for (const p of by) had[p] += l.ghs / by.length;
    }
    const sum = had.reduce((a, b) => a + b, 0);
    exact = sum > 0 ? had.map((h) => (h / sum) * bill) : everyone.map(() => bill / n);
  }
  exact = exact.map((x) => x + rides / n);

  /*
   * Whole cedis that add up to the total: everyone rounded down, then the
   * cedis left over go one each to the largest fractions. On a tie the
   * person who paid is last, so they are never the one asked for extra.
   */
  const total = Math.round(bill + rides);
  const shares = exact.map((x) => Math.floor(x));
  let left = total - shares.reduce((a, b) => a + b, 0);
  const payer = Math.min(Math.max(0, s.payer), n - 1);
  const order = everyone
    .map((i) => ({ i, frac: exact[i] - Math.floor(exact[i]) }))
    .sort((a, b) => b.frac - a.frac || Number(a.i === payer) - Number(b.i === payer) || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) shares[order[k].i] += 1;
  return { shares, total };
}
