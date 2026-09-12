import type { SupabaseClient } from "@supabase/supabase-js";
import { focusVenueTypes } from "./planner";
import type { EventRow, MenuItem, PlanInputs, Venue } from "./types";
import { PUBLIC_VENUE_COLUMNS } from "./venueColumns";

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

  /*
   * Named columns, not "*". Since migration 0014 the venue grant has been an
   * explicit list, and Postgres refuses SELECT * outright when any one column
   * is ungranted rather than returning the rest. See venueColumns.ts.
   */
  const runVenueQuery = async (columns: string[]) => {
    let q = supabase
      .from("venues")
      .select(`${columns.join(",")},areas(name)`)
      .eq("is_active", true)
      .in("price_band", bands);

    if (!inputs.surpriseMe && inputs.areaIds.length > 0) {
      q = q.in("area_id", inputs.areaIds);
    }
    return q;
  };

  /*
   * Drop a column the database does not have yet, and carry on.
   *
   * Naming columns was supposed to turn a missing one into a missing feature
   * rather than a dead product. It did not: a column named here that the
   * database has not got is just as fatal as an ungranted one, and shipping
   * the code for migration 0022 before the migration itself was run took plan
   * generation down a second time, in the same week, for the same reason in
   * mirror image.
   *
   * So now the query heals. Postgres answers 42703 and names the column it
   * cannot find, which is enough to drop it and ask again. A deploy that
   * arrives before its migration loses one field until the migration lands,
   * which is what "quietly absent" was always meant to mean.
   */
  let columns = [...PUBLIC_VENUE_COLUMNS] as string[];
  let venuesRaw: unknown[] | null = null;
  let error: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await runVenueQuery(columns);
    venuesRaw = result.data as unknown[] | null;
    error = result.error;
    if (!error) break;

    const missing = missingColumnOf(error);
    if (!missing || !columns.includes(missing)) break;

    console.warn(
      `venues.${missing} does not exist yet, so a migration has not been run. ` +
        `Planning without it.`
    );
    columns = columns.filter((c) => c !== missing);
  }

  if (error) throw new Error(`venues query failed: ${error.message}`);

  /*
   * Through unknown, because the select string is built from a constant array
   * rather than written inline, so the client cannot infer the row shape from
   * it. The shape is still checked: PUBLIC_VENUE_COLUMNS is the list the
   * database grants, and Venue is what the planner reads.
   */
  let venues = (venuesRaw ?? []) as unknown as Venue[];
  if (opts.excludeVenueIds?.length) {
    venues = venues.filter((v) => !opts.excludeVenueIds!.includes(v.id));
  }

  /*
   * A venue with no menu rows AND no average cost is unpriced, not free, the
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
    (v) => {
      // A venue flagged free has a known price of nothing, which is the
      // opposite of a venue whose price we simply do not have.
      if (v.is_free === true) return true;
      /*
       * Nobody has put a number to this one at all. Still withheld, because
       * an estimate is a claim and "unknown" is the absence of one.
       */
      if (v.price_source === "unknown") return false;
      return Number(v.avg_cost_per_person_ghs) > 0 || pricedVenueIds.has(v.id);
    }
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

/**
 * The column Postgres could not find, when that is what went wrong.
 *
 * 42703 is "undefined column", and PostgREST passes the message through
 * verbatim, so the name is right there: "column venues.cuisine does not
 * exist". Anything else is a real failure and is rethrown.
 */
function missingColumnOf(error: { code?: string; message?: string } | null): string | null {
  if (!error || error.code !== "42703") return null;
  const found = /column\s+(?:\w+\.)?"?([a-z0-9_]+)"?\s+does not exist/i.exec(error.message ?? "");
  return found?.[1] ?? null;
}
