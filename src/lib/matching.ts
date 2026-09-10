import type { SupabaseClient } from "@supabase/supabase-js";
import { focusVenueTypes } from "./planner";
import type { EventRow, MenuItem, PlanInputs, Venue } from "./types";

/**
 * Server-side candidate selection: pull venues, menus and events that
 * plausibly fit the request, so the model only ever sees real data.
 */

export interface Candidates {
  venues: Venue[];
  menuItems: MenuItem[];
  events: EventRow[];
  allAreaNames: string[];
  /**
   * Active venues in the whole catalog, ignoring every filter. Lets the caller
   * tell "your budget/area excluded everything" from "there is nothing to
   * choose from yet", which are very different messages to show a user.
   */
  totalActiveVenues: number;
}

/** "chill" chip maps onto calm/casual venue tags. */
const VIBE_ALIASES: Record<string, string[]> = {
  chill: ["calm", "casual"],
  calm: ["calm"],
  lively: ["lively"],
  romantic: ["romantic"],
  fun: ["fun"],
  adventurous: ["adventurous"],
};

function expandVibes(vibes: string[]): string[] {
  const out = new Set<string>();
  vibes.forEach((v) => (VIBE_ALIASES[v] ?? [v]).forEach((t) => out.add(t)));
  return Array.from(out);
}

/** Which price bands are affordable for this total (two-person) budget. */
export function allowedBands(budget: number): string[] {
  const bands = ["budget"];
  if (budget >= 300) bands.push("mid");
  if (budget >= 850) bands.push("premium");
  return bands;
}

export async function fetchCandidates(
  supabase: SupabaseClient,
  inputs: PlanInputs,
  opts: { excludeVenueIds?: string[] } = {}
): Promise<Candidates> {
  const bands = allowedBands(inputs.budget);
  const wantedTags = expandVibes(inputs.vibes);

  let venueQuery = supabase
    .from("venues")
    .select("*, areas(name)")
    .eq("is_active", true)
    .in("price_band", bands);

  if (!inputs.surpriseMe && inputs.areaIds.length > 0) {
    venueQuery = venueQuery.in("area_id", inputs.areaIds);
  }
  const { data: venuesRaw, error } = await venueQuery;
  if (error) throw new Error(`venues query failed: ${error.message}`);

  let venues = (venuesRaw ?? []) as Venue[];
  if (opts.excludeVenueIds?.length) {
    venues = venues.filter((v) => !opts.excludeVenueIds!.includes(v.id));
  }

  /*
   * A venue with no menu rows AND no average cost is unpriced, not free — the
   * catalog simply has no price for it yet. Left in, it is the cheapest option
   * in every search, so it wins constantly and lands in plans at GHS 0, which
   * quietly makes the whole budget meaningless. Withhold it until someone
   * gives it a price.
   */
  const pricedVenueIds = new Set(
    (
      await supabase
        .from("menu_items")
        .select("venue_id")
        .in("venue_id", venues.map((v) => v.id))
    ).data?.map((m: { venue_id: string }) => m.venue_id) ?? []
  );

  venues = venues.filter(
    (v) =>
      // A venue flagged free has a known price of nothing, which is the
      // opposite of a venue whose price we simply do not have.
      v.is_free === true ||
      Number(v.avg_cost_per_person_ghs) > 0 ||
      pricedVenueIds.has(v.id)
  );

  /*
   * Drop anything this group is the wrong size for.
   *
   * A padel court needs two people and seats four; offering it for a solo day
   * wastes the journey, and offering it to eight splits the group at the door.
   * Defaulted so a venue nobody has thought about behaves exactly as before.
   */
  venues = venues.filter((v) => {
    const min = Number(v.min_party_size ?? 1);
    const max = v.max_party_size == null ? Infinity : Number(v.max_party_size);
    return inputs.partySize >= min && inputs.partySize <= max;
  });

  // Score: vibe overlap (heavily weighted) + occasion fit; keep a fallback
  // pool so a low-overlap request still gets real options rather than none.
  const scored = venues
    .map((v) => {
      const overlap = v.vibe_tags.filter((t) => wantedTags.includes(t)).length;
      const occasion = v.best_for.includes(inputs.occasion) ? 1 : 0;
      return { v, score: overlap * 2 + occasion };
    })
    .sort((a, b) => b.score - a.score);

  const withOverlap = scored.filter((s) => s.score > 0).map((s) => s.v);
  const pool = withOverlap.length >= 4 ? withOverlap : scored.map((s) => s.v);
  let picked = pool.slice(0, 14);

  /*
   * Reserve room for the kinds of venue the request is actually about.
   *
   * Vibe scoring is type-blind, so a catalogue with nineteen restaurants and
   * four bars fills every slot with restaurants and a "just drinks" plan
   * arrives at the planner with no bar to use. The focus types are added back
   * from the full scored list, best first.
   */
  const focusTypes = focusVenueTypes(inputs.focus);
  if (focusTypes.length) {
    const have = new Set(picked.map((v) => v.id));
    const missing = scored
      .map((s) => s.v)
      .filter((v) => focusTypes.includes(v.type) && !have.has(v.id))
      .slice(0, 8);
    picked = [...picked, ...missing];
  }

  const venueIds = picked.map((v) => v.id);
  const [{ data: menuItems }, eventsRes] = await Promise.all([
    venueIds.length
      ? supabase.from("menu_items").select("*").in("venue_id", venueIds)
      : Promise.resolve({ data: [] as MenuItem[] }),
    supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .eq("event_date", inputs.date),
  ]);

  let events = (eventsRes.data ?? []) as EventRow[];
  if (!inputs.surpriseMe && inputs.areaIds.length > 0) {
    events = events.filter((e) => inputs.areaIds.includes(e.area_id));
  }

  const [{ data: allAreas }, { count: totalActiveVenues }] = await Promise.all([
    supabase.from("areas").select("name"),
    supabase
      .from("venues")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  return {
    venues: picked,
    menuItems: (menuItems ?? []) as MenuItem[],
    events,
    allAreaNames: (allAreas ?? []).map((a: { name: string }) => a.name),
    totalActiveVenues: totalActiveVenues ?? 0,
  };
}

/** Cheapest realistic two-person spend for a set of venues (for honest budget advice). */
export function cheapestTwoStopEstimate(venues: Venue[]): number {
  const costs = venues
    .map((v) => Number(v.avg_cost_per_person_ghs) * 2)
    .sort((a, b) => a - b);
  if (costs.length < 2) return 0;
  return Math.round(costs[0] + costs[1] + 40); // + one flat transport hop
}
