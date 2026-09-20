import type { SupabaseClient } from "@supabase/supabase-js";
import { expandVibes, loungeFloor } from "./catalog";
import { focusVenueTypes, meetingVenueTypes } from "./planner";
import { weekdayOf } from "./hours";
import type { EventRow, MenuItem, PlanInputs, Venue, VenueSchedule, VenueType } from "./types";
import { PUBLIC_VENUE_COLUMNS } from "./venueColumns";
import { fetchAllRows } from "./fetchAll";

/**
 * Server-side candidate selection: pull venues, menus and events that
 * plausibly fit the request, so the model only ever sees real data.
 */

export interface Candidates {
  venues: Venue[];
  menuItems: MenuItem[];
  events: EventRow[];
  /**
   * What the shortlisted venues do every week: karaoke on Thursdays, a band on
   * Fridays. Loaded for the whole shortlist and matched to a slot's own hours
   * by the planner, because a fixture only counts if it is on while the party
   * is actually there.
   */
  schedules: VenueSchedule[];
  allAreaNames: string[];
  /**
   * Active venues in the whole catalog, ignoring every filter. Lets the caller
   * tell "your budget/area excluded everything" from "there is nothing to
   * choose from yet", which are very different messages to show a user.
   */
  totalActiveVenues: number;
}

/*
 * Vibe translation lives in catalog.ts now, rather than in a copy kept here.
 *
 * This file had a map covering six of the plan flow's fourteen chips and
 * planner.ts had a different one covering eight, and this is the half that
 * decides which venues the model is even shown. So a request for Beach,
 * Dancing, Club hopping, Sporty, Outdoorsy, Picnic, Artsy or Foodie fell
 * through to a literal tag lookup that no row could satisfy, and the shortlist
 * came back ranked as though no vibe had been chosen. Re-exported because
 * callers already import it from here.
 */
export { expandVibes };

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
   * Started here rather than beside the menu fetch below, because what is on
   * that night decides part of the shortlist and the shortlist is settled
   * before the menus are read. Nothing in it depends on the venue query, so it
   * runs alongside rather than after.
   */
  const eventsPromise = supabase
    .from("events")
    .select("*")
    .eq("is_active", true)
    .eq("event_date", inputs.date);

  /*
   * Started here for the same reason, and it is a stronger one.
   *
   * A venue with a door charge and no menu is priced: you know exactly what
   * the evening costs there. The unpriced filter below withholds it anyway
   * unless it can see the charge, so the fixtures have to be in hand before
   * that filter runs rather than after the shortlist is already settled.
   *
   * The whole table, not a slice of it. venue_schedules holds one row per
   * venue per weekly fixture and is tiny; narrowing it would need the
   * shortlist, which is the thing this is being used to decide.
   */
  const schedulesPromise = supabase
    .from("venue_schedules")
    .select("*")
    .eq("is_active", true);

  const [eventsRes, schedulesRes] = await Promise.all([eventsPromise, schedulesPromise]);

  let events = (eventsRes.data ?? []) as EventRow[];
  if (!inputs.surpriseMe && inputs.areaIds.length > 0) {
    events = events.filter((e) => inputs.areaIds.includes(e.area_id));
  }
  const allSchedules = (schedulesRes.data ?? []) as VenueSchedule[];

  /*
   * Venues priced by the door rather than by a menu.
   *
   * An event centre with a ticketed conference, a hotel with a talk on, a club
   * that takes fifty cedis to get in: none of them need a menu on file, and
   * none of them is an unpriced venue. We know precisely what being there
   * costs, which is the only thing the unpriced filter is actually asking.
   *
   * A recorded figure, not merely an event. Null means nobody wrote a price
   * down, which is the same "we do not know" the rest of this catalogue is
   * careful about, and reading it as free is how a rooftop bar ends up in a
   * plan at nothing. Zero is different and is a price: somebody recorded that
   * it is free to get in.
   *
   * For fixtures the weekday has to match. A Thursday karaoke night prices a
   * Thursday and says nothing about the Monday somebody is planning.
   */
  const weekday = weekdayOf(inputs.date);
  const pricedByDoor = new Set<string>();
  for (const e of events) {
    if (e.venue_id && e.cost_ghs != null) pricedByDoor.add(e.venue_id);
  }
  for (const f of allSchedules) {
    if (f.cover_ghs != null && (weekday === null || f.weekday === weekday)) {
      pricedByDoor.add(f.venue_id);
    }
  }

  /*
   * Named columns, not "*". Since migration 0014 the venue grant has been an
   * explicit list, and Postgres refuses SELECT * outright when any one column
   * is ungranted rather than returning the rest. See venueColumns.ts.
   */
  const runVenueQuery = async (columns: string[]) => {
    /*
     * Free is affordable at every budget.
     *
     * The band filter is a price filter, and a venue flagged free has a price
     * of nothing whatever band somebody happened to file it under. Filtering
     * on band alone made a free park recorded as "mid" invisible to exactly
     * the plan that needs it, the one with no money.
     */
    /*
     * Three ways to be affordable, not one.
     *
     * The band is a guess at what a place costs per head, which is the right
     * filter for a restaurant and the wrong one for a door charge: a free talk
     * at a hotel filed as premium is affordable on any budget, and the band
     * would have hidden it from exactly the plans that could take it. Whether
     * the evening actually fits is settled later, by the real figures.
     */
    const doorIds = [...pricedByDoor];
    const affordable = [
      `price_band.in.(${bands.join(",")})`,
      "is_free.is.true",
      ...(doorIds.length ? [`id.in.(${doorIds.join(",")})`] : []),
    ].join(",");

    let q = supabase
      .from("venues")
      .select(`${columns.join(",")},areas(name)`)
      .eq("is_active", true)
      .or(affordable);

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
  /*
   * Which venue's menu prices this one.
   *
   * A branch can be priced from another branch: The Honeysuckle has five
   * locations and one menu, held once on the Osu row. Without this the other
   * four look unpriced and are withheld from every plan, which is the same
   * outcome as not having entered them at all.
   *
   * One level only, which the database enforces with a trigger, so this is a
   * lookup rather than a walk.
   */
  const menuOwnerOf = (v: Venue): string =>
    (v as { menu_shared_from?: string | null }).menu_shared_from || v.id;

  const pricedVenueIds = new Set(
    (
      await fetchAllRows<{ venue_id: string }>((from, to) =>
        supabase
          .from("menu_items")
          .select("venue_id")
          // Both, for the same reason as below: a branch with a dish of its
          // own is priced even before its owner's list is counted.
          .in("venue_id", [...new Set(venues.flatMap((v) => [v.id, menuOwnerOf(v)]))])
          .range(from, to)
      )
    ).map((m) => m.venue_id)
  );

  venues = venues.filter(
    (v) => {
      // A venue flagged free has a known price of nothing, which is the
      // opposite of a venue whose price we simply do not have.
      if (v.is_free === true) return true;
      /*
       * Charged at the door. Some places have no menu we hold and do not need
       * one: the ticket or the cover is the price of being there, and the
       * planner prices the stop from it.
       */
      if (pricedByDoor.has(v.id)) return true;
      /*
       * Nobody has put a number to this one at all. Still withheld, because
       * an estimate is a claim and "unknown" is the absence of one.
       */
      if (v.price_source === "unknown") return false;
      return (
        Number(v.avg_cost_per_person_ghs) > 0 ||
        pricedVenueIds.has(menuOwnerOf(v)) ||
        pricedVenueIds.has(v.id)
      );
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

  /*
   * A crawl asked for by vibe needs the same reservation a crawl asked for by
   * focus gets. "Club hopping" leaves the focus on everything, so focusTypes
   * comes back empty, and the shortlist fills with restaurants exactly as it
   * did before focus reservation existed. The planner would then be handed two
   * lounge slots and one bar to put in them, and quietly fill the second with
   * whatever else was to hand, which is the chip meaning nothing all over
   * again.
   */
  if (loungeFloor(inputs.vibes) > 0 && !focusTypes.includes("lounge")) {
    focusTypes.push("lounge");
  }

  /*
   * A business meeting names the kind of place outright, which is a stronger
   * statement than a vibe and gets the same reservation. Without it the one
   * stop a meeting has falls back to whatever the shortlist happened to hold,
   * and asking for a cafe returned a restaurant.
   */
  for (const t of meetingVenueTypes(inputs)) {
    if (!focusTypes.includes(t)) focusTypes.push(t);
  }

  if (focusTypes.length) {
    const have = new Set(picked.map((v) => v.id));
    const missing = scored
      .map((s) => s.v)
      .filter((v) => focusTypes.includes(v.type) && !have.has(v.id))
      .slice(0, 8);
    picked = [...picked, ...missing];
  }

  /*
   * Keep a couple of each kind in the shortlist.
   *
   * Vibe scoring is type-blind, and when nothing is asked for it is nearly
   * flat, so the top fourteen come back in whatever proportion the catalogue
   * happens to hold. That catalogue is mostly restaurants, which is how an
   * evening with no vibe chosen arrived as dinner followed by three more
   * dinners: the planner asked for something to do, then somewhere for a
   * drink, then pudding, and had nothing but restaurants to offer any of them.
   *
   * Reserving a slot in the shortlist is not preferring these venues. They
   * still have to win their slot on score. It only means the planner is given
   * the choice at all.
   */
  const SPREAD: VenueType[] = ["cafe", "lounge", "activity", "outdoor", "dessert"];
  for (const type of SPREAD) {
    const have = picked.filter((v) => v.type === type).length;
    if (have >= 2) continue;
    const held = new Set(picked.map((v) => v.id));
    const extra = scored
      .map((sc) => sc.v)
      .filter((v) => v.type === type && !held.has(v.id))
      .slice(0, 2 - have);
    picked = [...picked, ...extra];
  }

  /*
   * A venue with something on that night joins the shortlist outright.
   *
   * Scoring knows nothing about events, so the one place the evening is meant
   * to be built around could finish sixteenth of a hundred and never be
   * offered at all. This is the difference between an event the planner
   * declined to use and an event it was never shown.
   *
   * Only venues that already passed the filters above are added. An event at a
   * place that is inactive, the wrong size for the party or outside the
   * budget's price band is an event this plan cannot honestly include. Having
   * no menu is no longer one of those reasons: a ticketed event is itself a
   * price, and the filter above now counts it as one.
   */
  const alreadyPicked = new Set(picked.map((v) => v.id));
  const eventVenueIds = new Set(
    events.map((e) => e.venue_id).filter((id): id is string => Boolean(id))
  );
  picked = [
    ...picked,
    ...venues.filter((v) => eventVenueIds.has(v.id) && !alreadyPicked.has(v.id)),
  ];

  /*
   * Fixtures for the shortlist, narrowed from the set already in hand.
   *
   * Keyed on the venue's own id rather than the menu owner's: a branch shares
   * a menu with Osu but has its own Thursday, and treating a fixture the way
   * prices are treated would put Osu's karaoke in the East Legon plan.
   */
  const shortlisted = new Set(picked.map((v) => v.id));
  const schedules = allSchedules.filter((f) => shortlisted.has(f.venue_id));

  /*
   * Both lists: the one a branch borrows and the one it keeps itself.
   *
   * A shared menu is right for the ninety percent of a list that is the same
   * at every branch and wrong for the dish only one kitchen does. The portal
   * writes the difference by choosing which row an item lands on, so reading
   * has to do the same in reverse: the owner's items, plus this venue's own.
   */
  const menuIds = [...new Set(picked.flatMap((v) => [v.id, menuOwnerOf(v)]))];
  /*
   * Paged. A dozen venues at two hundred dishes each passes PostgREST's
   * thousand-row cap, and a truncated menu here does not fail, it prices the
   * evening off whichever half of the menu arrived. The Honeysuckle alone is
   * 182 items and Bistro 22 is 156.
   */
  const ownerMenuItems = menuIds.length
    ? await fetchAllRows<MenuItem>((from, to) =>
        supabase.from("menu_items").select("*").in("venue_id", menuIds).range(from, to)
      )
    : ([] as MenuItem[]);

  const [{ data: allAreas }, { count: totalActiveVenues }] = await Promise.all([
    supabase.from("areas").select("name"),
    supabase
      .from("venues")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  /*
   * Re-addressed to the branch that will serve it.
   *
   * The planner groups menu items by venue_id, so a branch priced from Osu
   * needs Osu's items to arrive carrying the branch's own id. Copied rather
   * than re-pointed, because two branches can be in one plan and each needs
   * its own set: the ids must not collide.
   */
  const byOwner = new Map<string, MenuItem[]>();
  for (const m of ownerMenuItems) {
    const list = byOwner.get(m.venue_id) ?? [];
    list.push(m);
    byOwner.set(m.venue_id, list);
  }

  const menuItems: MenuItem[] = [];
  for (const v of picked) {
    const owner = menuOwnerOf(v);
    // Borrowed, re-addressed so the planner finds it under the branch's id.
    if (owner !== v.id) {
      for (const m of byOwner.get(owner) ?? []) {
        menuItems.push({ ...m, id: `${v.id}:${m.id}`, venue_id: v.id });
      }
    }
    // Its own, which needs no re-addressing and which a venue that shares with
    // nobody has all of.
    for (const m of byOwner.get(v.id) ?? []) menuItems.push(m);
  }

  return {
    venues: picked,
    menuItems,
    events,
    schedules,
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
