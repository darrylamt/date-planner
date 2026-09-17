import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../../fetchAll";
import { isOpenAt, parsePeriods, weekdayOf, describeDay } from "../../hours";
import type { MenuItem, Venue } from "../../types";

/**
 * The pieces every catalogue tool needs, in one place so they cannot drift
 * apart between tools. Each of these encodes a rule this codebase has already
 * paid to learn.
 */

/**
 * Which venue's menu prices this one.
 *
 * The Honeysuckle has five locations and one menu, held once on the Osu row.
 * Miss this and four of the five read as having no menu at all, which is the
 * same as not being in the catalogue. Note that /api/venues/[id] and the
 * mobile fetchMenu both skip it and are not templates to copy.
 *
 * One level only, enforced by a trigger in 0024, so this is a lookup and not
 * a walk.
 */
export function menuOwnerOf(v: Pick<Venue, "id" | "menu_shared_from">): string {
  return v.menu_shared_from || v.id;
}

/**
 * Every menu row for these venues, addressed to the venue that will serve it.
 *
 * Paged, because PostgREST caps an unbounded select at a thousand and a
 * truncated menu does not fail: it silently prices from whichever half
 * arrived. The Honeysuckle alone is 182 rows.
 */
export async function menusFor(
  supabase: SupabaseClient,
  venues: Pick<Venue, "id" | "menu_shared_from">[]
): Promise<Map<string, MenuItem[]>> {
  const ownerIds = [...new Set(venues.map(menuOwnerOf))];
  if (!ownerIds.length) return new Map();

  /*
   * "*" rather than a named column list, unlike the venues table. menu_items
   * has no revoked columns to work around, and a select string held in a
   * variable defeats the client's row inference, which is the same reason
   * matching.ts writes this query out in full.
   */
  const rows = await fetchAllRows<MenuItem>((from, to) =>
    supabase.from("menu_items").select("*").in("venue_id", ownerIds).range(from, to)
  );

  const byOwner = new Map<string, MenuItem[]>();
  for (const m of rows) {
    const list = byOwner.get(m.venue_id) ?? [];
    list.push(m);
    byOwner.set(m.venue_id, list);
  }

  // Re-addressed to the branch, so a caller holding two branches gets two
  // sets rather than one shared by id.
  const byVenue = new Map<string, MenuItem[]>();
  for (const v of venues) {
    byVenue.set(v.id, byOwner.get(menuOwnerOf(v)) ?? []);
  }
  return byVenue;
}

/**
 * Does the catalogue hold a price for this venue at all?
 *
 * Free is a known price of nothing. Unpriced is the absence of a price, and it
 * is withheld rather than shown as free: left in, an unpriced venue is the
 * cheapest thing in every search, wins constantly, and quietly makes the whole
 * budget meaningless. `price_source = 'unknown'` is withheld even when a
 * number exists, because an estimate is a claim and unknown is the refusal to
 * make one.
 */
export function isPriced(v: Venue, menuItemCount: number): boolean {
  if (v.is_free === true) return true;
  if (v.price_source === "unknown") return false;
  return Number(v.avg_cost_per_person_ghs) > 0 || menuItemCount > 0;
}

export type PriceNote =
  | { basis: "free" }
  | { basis: "menu"; typical_per_person_ghs: number; mains_ghs?: [number, number] }
  | { basis: "estimated"; per_person_range_ghs: [number, number] }
  | { basis: "unknown" };

/**
 * What this place costs, said only as precisely as we actually know.
 *
 * An estimate becomes a range rather than a figure. Presenting a guess to the
 * cedi is the same lie as an invented price, only better dressed, and
 * price_spread exists so the width of the guess travels with it.
 */
export function describePrice(v: Venue, menu: MenuItem[]): PriceNote {
  if (v.is_free) return { basis: "free" };
  if (v.price_source === "unknown") return { basis: "unknown" };

  const avg = Number(v.avg_cost_per_person_ghs) || 0;

  if (v.price_source === "estimated" && avg > 0) {
    const spread = Number(v.price_spread) || 0.3;
    return {
      basis: "estimated",
      per_person_range_ghs: [
        Math.round(avg * (1 - spread)),
        Math.round(avg * (1 + spread)),
      ],
    };
  }

  const mains = mainsRange(menu);
  if (avg > 0) {
    return mains
      ? { basis: "menu", typical_per_person_ghs: avg, mains_ghs: mains }
      : { basis: "menu", typical_per_person_ghs: avg };
  }
  if (mains) {
    return {
      basis: "menu",
      typical_per_person_ghs: Math.round((mains[0] + mains[1]) / 2),
      mains_ghs: mains,
    };
  }
  return { basis: "unknown" };
}

/**
 * What a plate here runs to.
 *
 * Falls through the categories rather than insisting on mains, the same way
 * adminCounts decides whether a menu is thin: a bar with no mains still has a
 * price list, and a cocktail bar answering "we have no mains" is a worse
 * answer than "drinks are 60 to 120".
 */
export function mainsRange(menu: MenuItem[]): [number, number] | null {
  const order: MenuItem["category"][] = ["main", "other", "starter", "activity", "drink", "dessert"];
  for (const category of order) {
    const prices = menu
      .filter((m) => m.category === category)
      .map((m) => Number(m.price_ghs))
      .filter((p) => p > 0)
      .sort((a, b) => a - b);
    if (prices.length >= 2) {
      // Trimmed, so one outlying seafood platter does not become the range.
      const lo = prices[Math.floor(prices.length * 0.1)];
      const hi = prices[Math.floor(prices.length * 0.9)];
      return [Math.round(lo), Math.round(hi)];
    }
    if (prices.length === 1) return [Math.round(prices[0]), Math.round(prices[0])];
  }
  return null;
}

export type OpenState = "open" | "closed" | "unknown";

/**
 * Open, shut, or not known, and never the three collapsed into two.
 *
 * Most of the catalogue has no hours on file. Reading that as "closed" empties
 * a search; reading it as "open" sends someone to a locked door. It is a third
 * answer and the model is told to say it out loud.
 */
export function openStateAt(v: Venue, dateISO: string, time?: string): OpenState {
  const periods = parsePeriods(v.opening_periods);
  if (!periods) return "unknown";

  const weekday = weekdayOf(dateISO);
  if (weekday === null) return "unknown";

  const minute = time ? minutesOfDay(time) : null;
  if (minute === null) {
    // No time asked about, so the question is only whether it opens that day.
    for (let m = 0; m < 1440; m += 30) {
      if (isOpenAt(periods, weekday, m)) return "open";
    }
    return "closed";
  }

  const state = isOpenAt(periods, weekday, minute);
  return state === null ? "unknown" : state ? "open" : "closed";
}

/** Hours for one day, in words, or "not known". */
export function hoursOn(v: Venue, dateISO: string): string {
  const weekday = weekdayOf(dateISO);
  if (weekday === null) return "not known";
  return describeDay(parsePeriods(v.opening_periods), weekday);
}

export function minutesOfDay(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * A venue as the model should see it in a list.
 *
 * Deliberately small. A search returning full rows is the single easiest way
 * to make every later turn in the conversation expensive, because the whole
 * result is resent as history on every request that follows it.
 */
export interface CompactVenue {
  id: string;
  name: string;
  area: string;
  type: Venue["type"];
  price: PriceNote;
  vibes: string[];
  /** Null means nobody has recorded it, which is not the same as "both". */
  cuisine: Venue["cuisine"];
  /** Specific kitchens. Empty means unrecorded, not "from nowhere". */
  serves?: string[];
  open?: OpenState;
  /** Only when the caller asked about a specific day. */
  hours?: string;
  /** Present only for a venue that borrows another's menu. */
  menu_from?: string;
}

export function compactVenue(
  v: Venue,
  menu: MenuItem[],
  opts: { date?: string; time?: string; ownerName?: string } = {}
): CompactVenue {
  const row: CompactVenue = {
    id: v.id,
    name: v.name,
    area: v.areas?.name ?? "",
    type: v.type,
    price: describePrice(v, menu),
    vibes: v.vibe_tags ?? [],
    cuisine: v.cuisine ?? null,
    ...(v.cuisines?.length ? { serves: v.cuisines } : {}),
  };
  if (opts.date) {
    row.open = openStateAt(v, opts.date, opts.time);
    row.hours = hoursOn(v, opts.date);
  }
  if (opts.ownerName) row.menu_from = opts.ownerName;
  return row;
}
