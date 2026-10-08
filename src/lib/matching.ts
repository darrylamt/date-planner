import type { SupabaseClient } from "@supabase/supabase-js";
import { expandVibes, loungeFloor } from "./catalog";
import { avoidPenalty, familyBonus, focusesOf, focusVenueTypes, meetingVenueTypes, placeFit, premiumLean } from "./planner";
import { avgIsNotAPrice, freeToVisit } from "./budget";
import { haversineKm } from "./transport";
import { DEFAULT_NEAR_KM, DEFAULT_RADIUS_KM } from "./planConstants";
import { DEFAULT_CITY, audienceAllows, wellnessAllowed } from "./planConstants";
import { schedulesDuring } from "./schedules";
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
  const wantsWellness = Boolean(inputs.wellness) && wellnessAllowed(inputs);

  /*
   * The city first, because every other filter happens inside it.
   *
   * areas.city has existed since the first migration and nothing read it, so
   * when Kumasi was added it was, as far as the planner could tell, another
   * neighbourhood of Accra: "Surprise me" drew on every area there was, and a
   * one-stop plan has no journey to price, so nothing stood between a person
   * in Osu and a table in Kumasi. Areas the person picked are kept only if
   * they belong to the city, and "Surprise me" now means anywhere in it rather
   * than anywhere at all.
   *
   * If the lookup itself fails the plan carries on unscoped, which is what
   * every plan did before this existed. Taking plan generation down over a
   * filter is the one outcome worse than the bug it fixes.
   */
  let scope: Set<string> | null = null;
  /*
   * The areas they picked, and how far past them to reach. With a reach, the
   * query covers the whole city and venues are kept by distance below; the
   * picked areas still score first, so a nearby place gets in on merit.
   */
  let pickedAreas: string[] = [];
  const reachKm = inputs.surpriseMe ? 0 : inputs.near ? inputs.radiusKm || DEFAULT_NEAR_KM : inputs.radiusKm ?? DEFAULT_RADIUS_KM;
  {
    const { data: allAreas, error: cityError } = await supabase.from("areas").select("id,city");
    if (cityError) {
      console.error("city lookup failed; planning unscoped", cityError);
    } else {
      const rows = (allAreas ?? []) as { id: string; city: string | null }[];
      const areasIn = (c: string) =>
        new Set(rows.filter((a) => (a.city || DEFAULT_CITY) === c).map((a) => a.id));
      /*
       * A city with no areas falls back to Accra rather than to an empty scope.
       * An empty list becomes `area_id=in.()`, which is not a query, and would
       * have failed every plan from a stale draft naming a city we no longer
       * hold.
       */
      let inCity = areasIn(inputs.city || DEFAULT_CITY);
      if (!inCity.size) inCity = areasIn(DEFAULT_CITY);
      if (inCity.size) {
        const picked = !inputs.surpriseMe && !inputs.near ? inputs.areaIds.filter((id) => inCity.has(id)) : [];
        pickedAreas = picked;
        scope = picked.length && !reachKm ? new Set(picked) : inCity;
      }
    }
  }

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
  if (scope) {
    // An event with no area recorded cannot be placed, and is kept, as before.
    events = events.filter((e) => !e.area_id || scope!.has(e.area_id));
  }
  /*
   * Not a night that has already started.
   *
   * Only today can hold one: events are fetched for the plan's own date, and
   * a plan cannot be made for a day that is over. But at seven in the evening
   * a gig that began at six is still "on today", and building an evening
   * round a door that has already shut is the one thing the event exists to
   * prevent. Accra is on GMT all year, so the server's UTC clock is its clock.
   */
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (inputs.date === today) {
    const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    events = events.filter((e) => {
      if (!e.start_time) return true;
      const [h, m] = e.start_time.split(":").map(Number);
      return h * 60 + m > nowMins;
    });
  }
  /*
   * Who can come.
   *
   * A night for ladies only is planned for a group that said it is all
   * ladies, and for nobody else; the same for men. Mixed is the default, so a
   * plan that never answered the question never meets one. A venue whose
   * ladies-only fixture overlaps the planned hours is closed to everybody
   * else for the evening, since the group would be turned away at the door,
   * and the fixture itself is dropped so it is never offered as what is on.
   */
  const crew = inputs.crew ?? "mixed";
  events = events.filter((e) => audienceAllows(e.audience, crew));
  const fixturesRaw = (schedulesRes.data ?? []) as VenueSchedule[];
  const [sh, sm] = inputs.startTime.split(":").map(Number);
  const closedTonight = new Set(
    schedulesDuring(
      fixturesRaw.filter((f) => !audienceAllows(f.audience, crew)),
      inputs.date,
      sh * 60 + (sm || 0),
      Math.round(inputs.hours * 60)
    ).map((f) => f.venue_id)
  );
  const allSchedules = fixturesRaw.filter((f) => audienceAllows(f.audience, crew));

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
     * Every active venue in scope, whatever its price band. Affordability is
     * settled below, once the menus are in hand: see "Affordable" there.
     */
    let q = supabase
      .from("venues")
      .select(`${columns.join(",")},areas(name)`)
      .eq("is_active", true);

    if (scope) q = q.in("area_id", [...scope]);
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
  if (closedTonight.size) venues = venues.filter((v) => !closedTonight.has(v.id));

  /*
   * A spa is only ever the stop somebody asked for.
   *
   * Left in, a massage is just another activity to a type-blind shortlist,
   * and a family day or a table of eight friends could be sent to one.
   */
  if (!wantsWellness) venues = venues.filter((v) => v.type !== "wellness");

  /*
   * The reach. A venue is in if it is in a picked area, or within reachKm of
   * one: of the area's middle, worked out from the venues in it that have a
   * pin, or of the point for "near me". A venue with no pin of its own is
   * placed at its area's middle, the same stand-in the route check uses.
   */
  if (!inputs.surpriseMe && reachKm > 0 && (inputs.near || pickedAreas.length)) {
    const sums = new Map<string, { lat: number; lng: number; n: number }>();
    for (const v of venues) {
      if (v.lat == null || v.lng == null) continue;
      const s = sums.get(v.area_id) ?? { lat: 0, lng: 0, n: 0 };
      s.lat += Number(v.lat);
      s.lng += Number(v.lng);
      s.n++;
      sums.set(v.area_id, s);
    }
    const middle = (areaId: string) => {
      const s = sums.get(areaId);
      return s ? { lat: s.lat / s.n, lng: s.lng / s.n } : null;
    };
    const anchors = inputs.near
      ? [inputs.near]
      : pickedAreas.map(middle).filter((p): p is { lat: number; lng: number } => p != null);
    const picked = new Set(pickedAreas);
    venues = venues.filter((v) => {
      if (picked.has(v.area_id)) return true;
      const at = v.lat != null && v.lng != null ? { lat: Number(v.lat), lng: Number(v.lng) } : middle(v.area_id);
      return at != null && anchors.some((a) => haversineKm(a, at) <= reachKm);
    });
    // Events follow the venues: only nights in an area the plan can reach.
    const reached = new Set([...pickedAreas, ...venues.map((v) => v.area_id)]);
    events = events.filter((e) => !e.area_id || reached.has(e.area_id));
  }

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

  const menuRows = await fetchAllRows<{ venue_id: string; price_ghs: number; category: string }>((from, to) =>
    supabase
      .from("menu_items")
      .select("venue_id, price_ghs, category")
      // Both, for the same reason as below: a branch with a dish of its
      // own is priced even before its owner's list is counted.
      .in("venue_id", [...new Set(venues.flatMap((v) => [v.id, menuOwnerOf(v)]))])
      .range(from, to)
  );
  const pricedVenueIds = new Set(menuRows.map((m) => m.venue_id));

  /*
   * The cheapest real meal on each menu: a main where there are mains,
   * otherwise the cheapest thing that is not a side or an extra.
   */
  const cheapestMain = new Map<string, number>();
  const cheapestAny = new Map<string, number>();
  for (const m of menuRows) {
    const price = Number(m.price_ghs);
    if (!(price > 0) || m.category === "other") continue;
    if (price < (cheapestAny.get(m.venue_id) ?? Infinity)) cheapestAny.set(m.venue_id, price);
    if (m.category === "main" && price < (cheapestMain.get(m.venue_id) ?? Infinity)) cheapestMain.set(m.venue_id, price);
  }

  /*
   * Affordable, by the band where that is all we have, and by the menu where
   * there is one.
   *
   * The band is a guess at what a place costs per head: the right filter for
   * a restaurant nobody has priced, and the wrong one for everything else.
   * Not one of the 97 restaurants with a menu was filed "budget", so a GHS
   * 200 plan for two dropped all of them without reading what they charge.
   * So a venue outside the budget's bands is still kept when:
   *   - it is free to visit (a gallery, a beach), which is free in any band;
   *   - its entry is on record (0075), or it charges at the door tonight;
   *   - it is a spa somebody asked for, judged on its treatments, never the
   *     band (filed premium, every spa vanished below GHS 850);
   *   - its cheapest meal for the whole party fits inside most of the budget.
   * Whether the evening actually fits is settled later, by the real figures.
   */
  const bandOk = (v: Venue) => bands.includes(String(v.price_band));
  const menuFits = (v: Venue) => {
    const owner = menuOwnerOf(v);
    const main = cheapestMain.get(owner) ?? cheapestMain.get(v.id);
    const any = cheapestAny.get(owner) ?? cheapestAny.get(v.id);
    const meal = v.type === "restaurant" ? main ?? any : any;
    return meal != null && meal * inputs.partySize <= inputs.budget * 0.7;
  };
  venues = venues.filter(
    (v) =>
      bandOk(v) ||
      freeToVisit(v) ||
      v.entry_fee_ghs != null ||
      pricedByDoor.has(v.id) ||
      (wantsWellness && v.type === "wellness") ||
      menuFits(v)
  );

  venues = venues.filter(
    (v) => {
      // A venue free to visit has a known price of nothing, which is the
      // opposite of a venue whose price we simply do not have. Never a bar or
      // a place to eat: see FREE_TYPES.
      if (freeToVisit(v)) return true;
      /*
       * Charged at the door. Some places have no menu we hold and do not need
       * one: the ticket or the cover is the price of being there, and the
       * planner prices the stop from it.
       */
      if (pricedByDoor.has(v.id)) return true;
      // Its usual entry is on record (0075), free or not.
      if (v.entry_fee_ghs != null) return true;
      /*
       * Nobody has put a number to this one at all. Still withheld, because
       * an estimate is a claim and "unknown" is the absence of one.
       */
      if (v.price_source === "unknown") return false;
      const hasMenu = pricedVenueIds.has(menuOwnerOf(v)) || pricedVenueIds.has(v.id);
      // An import default, not a price: see PLACEHOLDER_AVG_GHS.
      // The GHS 100 import default, or a place to eat with no menu.
      if (avgIsNotAPrice(v, hasMenu)) return false;
      return Number(v.avg_cost_per_person_ghs) > 0 || hasMenu;
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
      /*
       * The same preferences the planner scores, so a beachside place can
       * reach the shortlist at all: a venue left out here is one no amount of
       * planner scoring can choose.
       */
      const prefs =
        placeFit(v, inputs.partner?.place ?? "") -
        avoidPenalty(v, inputs.partner?.avoid ?? "") +
        familyBonus(v, inputs) +
        // Here too, or a premium restaurant never reaches the planner to be chosen.
        premiumLean(v, inputs);
      /*
       * The areas they named come first. With a reach, the shortlist spans
       * the neighbourhoods around them too, and scored on feel alone the
       * neighbours crowded the named area out: Osu fell from 12 of the
       * shortlist to 3 at five kilometres. Three points, a vibe and a half,
       * so a nearby place still gets in when it is the better fit.
       */
      const named = pickedAreas.includes(v.area_id) ? 3 : 0;
      /*
       * Under a point of chance, so equally good places take turns at the
       * fourteen places on the shortlist instead of the same fourteen winning
       * every tie. The planner adds its own, larger, among the shortlist.
       */
      return { v, score: overlap * 2 + occasion + prefs + named + Math.random() * 0.9 };
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
  const focusTypes = focusVenueTypes(focusesOf(inputs));

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

  // Asked for, so reserved: the shortlist is mostly restaurants.
  if (wantsWellness && !focusTypes.includes("wellness")) focusTypes.push("wellness");

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
    supabase.from("areas").select("name, city"),
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
    /*
     * This city's areas only. "Widen to" offered the first two names in the
     * whole table, so a Kumasi plan that came up short was told to try Osu
     * and Labone.
     */
    allAreaNames: ((allAreas ?? []) as { name: string; city: string | null }[])
      .filter((a) => (a.city || DEFAULT_CITY).toLowerCase() === (inputs.city || DEFAULT_CITY).toLowerCase())
      .map((a) => a.name),
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
