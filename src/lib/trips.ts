/**
 * Trips within Ghana (0101): where a trip can go and the ways there. Plain
 * values, safe in the browser: the admin, its save route and /api/trips
 * share them, and the database checks the same lists.
 */

export const TRAVEL_MODES = [
  { id: "bus", label: "Bus" },
  { id: "trotro", label: "Trotro" },
  { id: "car", label: "Car with a driver" },
  { id: "flight", label: "Flight" },
  { id: "ferry", label: "Boat" },
] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number]["id"];
export const TRAVEL_MODE_IDS = TRAVEL_MODES.map((m) => m.id) as [TravelMode, ...TravelMode[]];

export interface Destination {
  slug: string;
  name: string;
  region: string;
  town: string | null;
  gateway_town: string;
  last_leg: string | null;
  lat: number | null;
  lng: number | null;
  radius_km: number;
  road_km_from_accra: number | null;
  blurb: string | null;
  highlights: string[];
  best_time: string | null;
  hero_image: string | null;
  image_credit: string | null;
  image_license: string | null;
  image_source: string | null;
  wiki_url: string | null;
  notes: string | null;
  is_active: boolean;
  sort: number;
}

export interface IntercityRoute {
  id: string;
  from_town: string;
  to_town: string;
  mode: TravelMode;
  operator: string;
  service: string;
  both_ways: boolean;
  from_station: string | null;
  to_station: string | null;
  departures: string | null;
  duration_mins: number | null;
  fare_min_ghs: number | null;
  fare_max_ghs: number | null;
  book_url: string | null;
  book_phone: string | null;
  source_url: string | null;
  notes: string | null;
  checked_on: string | null;
  is_active: boolean;
}

/** "GHS 150", "GHS 80 to 120", or "from GHS 999" when only the lowest is known. */
export function tripFareText(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const f = (n: number) => `GHS ${Number.isInteger(n) ? n.toLocaleString("en-GH") : n.toFixed(2)}`;
  if (max == null) return `from ${f(Number(min))}`;
  if (min == null || Number(min) === Number(max)) return f(Number(max));
  return `${f(Number(min))} to ${Number(max).toLocaleString("en-GH")}`;
}

/** Routes that reach a destination: to its gateway town, or back from it where the fare holds both ways. */
export function routesTo(d: Pick<Destination, "gateway_town" | "town">, routes: IntercityRoute[]): IntercityRoute[] {
  const towns = new Set([d.gateway_town, d.town].filter(Boolean).map((t) => t!.toLowerCase()));
  return routes.filter((r) => towns.has(r.to_town.toLowerCase()) || (r.both_ways && towns.has(r.from_town.toLowerCase())));
}

/**
 * What a destination still needs before a trip there can be planned, in the
 * order the plan sets (.claude/plans): a priced stay, a way there, and
 * enough places to fill the days. Empty means ready.
 */
export const VENUES_FOR_READY = 6;
export function missingFor(c: { pricedStays: number; routes: number; venues: number }): string[] {
  const out: string[] = [];
  if (c.pricedStays < 1) out.push("a stay with rates");
  if (c.routes < 1) out.push("a way there");
  if (c.venues < VENUES_FOR_READY) out.push(`${VENUES_FOR_READY - c.venues} more places to go`);
  return out;
}

/** "Photo: Stig Nygaard, CC BY 2.0, Wikimedia Commons": what CC BY and CC BY-SA ask for. */
export function photoCredit(d: Pick<Destination, "image_credit" | "image_license" | "image_source">): string | null {
  if (!d.image_credit && !d.image_license) return null;
  const from = d.image_source?.includes("wikimedia.org") ? "Wikimedia Commons" : null;
  return ["Photo: " + (d.image_credit ?? "unknown"), d.image_license, from].filter(Boolean).join(", ");
}
