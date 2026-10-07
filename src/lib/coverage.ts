import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./fetchAll";
import { avgIsNotAPrice, freeToVisit } from "./budget";
import { DEFAULT_RADIUS_KM } from "./planConstants";
import { haversineKm } from "./transport";

/**
 * The kinds of place an outing is made of, as somebody signing venues thinks
 * of them, with the search that finds more of each on Google (see Discover).
 * Spas are left out on purpose: a plan never needs one, so a neighbourhood
 * without one is not short of anything.
 */
export const COVERAGE_KINDS = [
  { id: "eat", label: "places to eat", types: ["restaurant"], discover: "restaurants" },
  { id: "drinks", label: "bars and lounges", types: ["lounge"], discover: "bars" },
  { id: "do", label: "things to do", types: ["activity", "outdoor"], discover: "things to do" },
  { id: "sweet", label: "cafes and dessert", types: ["cafe", "dessert"], discover: "dessert shops" },
] as const;

export type CoverageKind = (typeof COVERAGE_KINDS)[number]["id"];

export interface AreaCoverage {
  id: string;
  name: string;
  /** Active venues filed here. */
  held: number;
  /** Of those, the ones a plan can actually use: priced, free, or priced at the door. */
  plannable: number;
  /** Active but withheld from every plan until somebody gives them a price. */
  waiting: number;
  /** Those venues, so the page can name them rather than only count them. */
  waitingVenues: { id: string; name: string; type: string }[];
  byKind: Record<CoverageKind, number>;
  /** Kinds with nothing plannable here at all. */
  missing: CoverageKind[];
  /**
   * Plannable venues a plan here can actually use: in the area, or within the
   * default reach of its middle, exactly as the planner keeps them. La holds
   * two but reaches into Labone and Osu, and plans fine.
   */
  reach: number;
  reachByKind: Record<CoverageKind, number>;
  /**
   * Too little within reach to fill an outing. Checked against
   * scripts/reach-check: every area that failed requests had five or fewer
   * within reach, and somewhere with nowhere to eat, or with nothing to go on
   * to after eating, fails an evening however many restaurants it has.
   */
  thin: boolean;
  /**
   * Thin now, and pricing what it already holds would be enough to fill an
   * outing: the cheapest fix there is, since nobody has to find anything.
   */
  fixedByPricing: boolean;
}

/**
 * What each area holds, counted the way the planner counts it.
 *
 * The planner withholds a venue with no price (no menu rows, no real average,
 * or a source of "unknown"), so a neighbourhood with ten venues and eight of
 * them unpriced plans like a neighbourhood with two. Counting only active rows
 * would call it covered; this says it has two and eight waiting.
 */
export async function areaCoverage(supabase: SupabaseClient): Promise<AreaCoverage[]> {
  type V = {
    id: string;
    name: string;
    area_id: string | null;
    type: string;
    is_free: boolean | null;
    price_source: string | null;
    avg_cost_per_person_ghs: number | null;
    menu_shared_from: string | null;
    lat: number | null;
    lng: number | null;
  };
  const [{ data: areas }, venues, menuRows, covers] = await Promise.all([
    supabase.from("areas").select("id, name"),
    fetchAllRows<V>((a, b) =>
      supabase
        .from("venues")
        .select("id, name, area_id, type, is_free, price_source, avg_cost_per_person_ghs, menu_shared_from, lat, lng")
        .eq("is_active", true)
        .range(a, b)
    ),
    fetchAllRows<{ venue_id: string }>((a, b) => supabase.from("menu_items").select("venue_id").range(a, b)),
    fetchAllRows<{ venue_id: string }>((a, b) =>
      supabase.from("venue_schedules").select("venue_id").not("cover_ghs", "is", null).range(a, b)
    ),
  ]);

  const hasMenu = new Set(menuRows.map((m) => m.venue_id));
  const byDoor = new Set(covers.map((c) => c.venue_id));
  const plannable = (v: V) => {
    if (freeToVisit(v)) return true;
    if (byDoor.has(v.id)) return true;
    if (v.price_source === "unknown") return false;
    const menu = hasMenu.has(v.menu_shared_from || v.id) || hasMenu.has(v.id);
    if (avgIsNotAPrice(v as never, menu)) return false;
    return Number(v.avg_cost_per_person_ghs) > 0 || menu;
  };

  const out = new Map<string, AreaCoverage>();
  for (const a of (areas ?? []) as { id: string; name: string }[]) {
    out.set(a.id, {
      id: a.id,
      name: a.name,
      held: 0,
      plannable: 0,
      waiting: 0,
      waitingVenues: [],
      byKind: { eat: 0, drinks: 0, do: 0, sweet: 0 },
      missing: [],
      reach: 0,
      reachByKind: { eat: 0, drinks: 0, do: 0, sweet: 0 },
      thin: true,
      fixedByPricing: false,
    });
  }
  for (const v of venues) {
    const c = v.area_id ? out.get(v.area_id) : undefined;
    if (!c) continue;
    c.held++;
    if (!plannable(v)) {
      c.waiting++;
      c.waitingVenues.push({ id: v.id, name: v.name, type: v.type });
      continue;
    }
    c.plannable++;
    const kind = COVERAGE_KINDS.find((k) => (k.types as readonly string[]).includes(v.type));
    if (kind) c.byKind[kind.id]++;
  }
  // Each area's middle from its pinned venues, and every venue's position:
  // its own pin, or its area's middle, the stand-in the planner uses.
  const sums = new Map<string, { lat: number; lng: number; n: number }>();
  for (const v of venues) {
    if (!v.area_id || v.lat == null || v.lng == null) continue;
    const s = sums.get(v.area_id) ?? { lat: 0, lng: 0, n: 0 };
    s.lat += Number(v.lat);
    s.lng += Number(v.lng);
    s.n++;
    sums.set(v.area_id, s);
  }
  const middle = (areaId: string | null) => {
    const s = areaId ? sums.get(areaId) : undefined;
    return s ? { lat: s.lat / s.n, lng: s.lng / s.n } : null;
  };
  const placed = venues.map((v) => ({
    area: v.area_id,
    priced: plannable(v),
    kind: COVERAGE_KINDS.find((k) => (k.types as readonly string[]).includes(v.type))?.id ?? null,
    at: v.lat != null && v.lng != null ? { lat: Number(v.lat), lng: Number(v.lng) } : middle(v.area_id),
  }));
  const thinGiven = (n: number, k: Record<CoverageKind, number>) =>
    n <= 5 || k.eat === 0 || k.drinks + k.do + k.sweet === 0;

  for (const c of out.values()) {
    c.missing = COVERAGE_KINDS.filter((k) => c.byKind[k.id] === 0).map((k) => k.id);
    const here = middle(c.id);
    // What it could reach with everything it holds priced, beside what it reaches now.
    let ifPriced = 0;
    const ifPricedByKind: Record<CoverageKind, number> = { eat: 0, drinks: 0, do: 0, sweet: 0 };
    for (const u of placed) {
      const inReach = u.area === c.id || (here != null && u.at != null && haversineKm(here, u.at) <= DEFAULT_RADIUS_KM);
      if (!inReach) continue;
      ifPriced++;
      if (u.kind) ifPricedByKind[u.kind]++;
      if (!u.priced) continue;
      c.reach++;
      if (u.kind) c.reachByKind[u.kind]++;
    }
    c.thin = thinGiven(c.reach, c.reachByKind);
    c.fixedByPricing = c.thin && !thinGiven(ifPriced, ifPricedByKind);
  }
  return [...out.values()];
}
