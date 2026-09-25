/**
 * Getting around Accra without a car: the rows, and the one piece of logic.
 *
 * Kept free of Supabase and React so the app can take it as it is once the
 * web preview has been tried: the same finder on both sides means the phone
 * cannot give different directions from the page they were tested on.
 */

export interface TrotroStation {
  id: string;
  name: string;
  area_id: string | null;
  lat: number | null;
  lng: number | null;
  where_exactly: string | null;
  is_hub: boolean;
  is_active: boolean;
  checked_on: string | null;
}

export interface TrotroRoute {
  id: string;
  from_station_id: string;
  to_station_id: string;
  called_as: string | null;
  board_note: string | null;
  fare_min_ghs: number | null;
  fare_max_ghs: number | null;
  minutes: number | null;
  runs: string | null;
  notes: string | null;
  is_active: boolean;
  checked_on: string | null;
}

export interface VenueAccess {
  venue_id: string;
  landmark: string | null;
  station_id: string | null;
  drop_point: string | null;
  walk_minutes: number | null;
  walk_directions: string | null;
  checked_on: string | null;
}

export interface CarRental {
  id: string;
  name: string;
  phone: string | null;
  whatsapp_phone: string | null;
  website: string | null;
  with_driver: boolean;
  self_drive: boolean;
  day_rate_min_ghs: number | null;
  day_rate_max_ghs: number | null;
  areas_served: string | null;
  notes: string | null;
  is_active: boolean;
  checked_on: string | null;
}

/**
 * The approved trotro fare steps, nationwide, as GPRTU and GRTCC set them with
 * the Ministry of Transport: an 8% rise on the May 2025 schedule, in force
 * from 26 September 2026.
 *
 * Steps, not a rate. The schedule is a list of approved fare levels that
 * terminals assign to routes; there is no official cedis-per-kilometre figure
 * to compute one from, so the planner never guesses which step a trip is.
 * These are offered to an admin as the values a checked fare should take, and
 * the range is shown to a visitor where nobody has checked the fare yet.
 *
 * Update together with OFFICIAL_FARES_FROM when the next adjustment comes.
 */
export const OFFICIAL_TROTRO_FARES = [5.5, 6.5, 7.6, 8.7, 9.8, 11, 16.2, 21.6, 27, 32.4, 36.8];
export const OFFICIAL_FARES_FROM = "26 September 2026";
export const officialFareRange = () =>
  `GHS ${OFFICIAL_TROTRO_FARES[0].toFixed(2)} to ${OFFICIAL_TROTRO_FARES[OFFICIAL_TROTRO_FARES.length - 1].toFixed(2)}`;

/** A trip is one or more rides in a row, each one a checked route. */
export interface Trip {
  legs: TrotroRoute[];
  minutes: number | null;
  fareMin: number | null;
  fareMax: number | null;
}

/** Most changes a trip may have. Two changes is already a long way round. */
const MAX_LEGS = 3;

/**
 * Every way from one station to another over routes somebody has checked,
 * fewest rides first, then quickest.
 *
 * Only real rows: no leg is ever inferred, reversed or guessed. A route from
 * Circle to Madina says nothing about Madina to Circle until somebody has
 * ridden it and added it, because trotros do not always run the same road
 * back and a newcomer cannot tell a guess from a fact.
 *
 * Minutes and fares add up only when every leg has one. A trip where one leg
 * is unknown has an unknown total, not a smaller one.
 */
export function findTrips(
  routes: TrotroRoute[],
  fromId: string,
  toId: string,
  limit = 3
): Trip[] {
  if (fromId === toId) return [];
  const out = new Map<string, TrotroRoute[]>();
  for (const r of routes) {
    if (!r.is_active) continue;
    const list = out.get(r.from_station_id) ?? [];
    list.push(r);
    out.set(r.from_station_id, list);
  }

  const found: TrotroRoute[][] = [];
  let frontier: { at: string; legs: TrotroRoute[]; seen: Set<string> }[] = [
    { at: fromId, legs: [], seen: new Set([fromId]) },
  ];
  for (let depth = 0; depth < MAX_LEGS && frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const step of frontier) {
      for (const r of out.get(step.at) ?? []) {
        if (step.seen.has(r.to_station_id)) continue;
        const legs = [...step.legs, r];
        if (r.to_station_id === toId) {
          found.push(legs);
          continue;
        }
        next.push({ at: r.to_station_id, legs, seen: new Set([...step.seen, r.to_station_id]) });
      }
    }
    // Fewer rides always beats more, so stop at the first depth that arrives.
    if (found.length) break;
    frontier = next;
  }

  const sum = (legs: TrotroRoute[], pick: (r: TrotroRoute) => number | null) =>
    legs.every((l) => pick(l) != null) ? legs.reduce((t, l) => t + Number(pick(l)), 0) : null;

  return found
    .map((legs) => ({
      legs,
      minutes: sum(legs, (l) => l.minutes),
      fareMin: sum(legs, (l) => l.fare_min_ghs ?? l.fare_max_ghs),
      fareMax: sum(legs, (l) => l.fare_max_ghs ?? l.fare_min_ghs),
    }))
    .sort((a, b) => (a.minutes ?? 9999) - (b.minutes ?? 9999))
    .slice(0, limit);
}

/** "GHS 5" or "GHS 5 to 7", or null when nobody wrote a fare down. */
export function fareText(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const lo = Number(min ?? max);
  const hi = Number(max ?? min);
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return lo === hi ? `GHS ${f(lo)}` : `GHS ${f(lo)} to ${f(hi)}`;
}

/**
 * Uber, with the destination filled in. The universal link opens the app
 * when it is installed and the mobile site when it is not.
 */
export function uberLink(name: string, lat: number, lng: number): string {
  const q = new URLSearchParams({
    action: "setPickup",
    pickup: "my_location",
    "dropoff[latitude]": String(lat),
    "dropoff[longitude]": String(lng),
    "dropoff[nickname]": name,
  });
  return `https://m.uber.com/ul/?${q.toString()}`;
}

/** Google Maps directions to the place, which also shows it on a map. */
export function directionsLink(name: string, lat: number | null, lng: number | null): string {
  const destination = lat != null && lng != null ? `${lat},${lng}` : `${name}, Accra`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
