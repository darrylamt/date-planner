import type { PriceBand, VenueType } from "./types";

/**
 * Google Places (New), the factual half of a venue row.
 *
 * Google is authoritative for the things that are public, volatile and
 * dangerous to get wrong: whether a place is still open, where exactly it is,
 * and what number it answers on. A wrong phone number sends a customer to a
 * stranger, and a model reading the web can invent one; Places cannot.
 *
 * It is not authoritative for anything that makes aduro worth using, menus,
 * prices, who a place suits. Those stay in our own tables, joined on place_id.
 *
 * ── On cost ────────────────────────────────────────────────────────────────
 * Billing is driven by the field mask, not the endpoint, so the two calls here
 * ask for deliberately different things. The closure sweep runs over the whole
 * catalog on a schedule and asks only for id and businessStatus, the cheapest
 * mask there is. The admin lookup runs once per venue ever and asks for
 * everything worth having. Widening SWEEP_MASK would quietly reprice a
 * recurring job onto a dearer tier, so leave it alone.
 */
const BASE = "https://places.googleapis.com/v1";

/** Enough to answer "is this place still there?" and nothing more. */
const SWEEP_MASK = "id,businessStatus";

/** Everything worth pre-filling a venue row with. */
const DETAIL_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "googleMapsUri",
  "websiteUri",
  "internationalPhoneNumber",
  "businessStatus",
  "primaryType",
  "types",
  "priceLevel",
  "priceRange",
  "rating",
  "userRatingCount",
  "regularOpeningHours",
].join(",");

/**
 * Discovery asks for more than a name match, because the whole point is to
 * judge a place you have never heard of from the row alone.
 */
const DISCOVER_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.businessStatus",
  "places.primaryType",
  "places.types",
  "places.priceLevel",
  "places.rating",
  "places.userRatingCount",
].join(",");

/** Search results only need enough to pick the right one from a list. */
const SEARCH_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.businessStatus",
  "places.primaryType",
].join(",");

export type BusinessStatus =
  | "OPERATIONAL"
  | "CLOSED_TEMPORARILY"
  | "CLOSED_PERMANENTLY"
  | "FUTURE_OPENING";

export interface PlaceSummary {
  id: string;
  name: string;
  address: string;
  businessStatus: BusinessStatus | null;
  primaryType: string | null;
}

export interface PlaceDetails extends PlaceSummary {
  lat: number | null;
  lng: number | null;
  googleMapsUri: string | null;
  website: string | null;
  phone: string | null;
  priceLevel: string | null;
  /** Actual currency range when Google has one, better than any bucket. */
  priceRange: { currency: string; min: number | null; max: number | null } | null;
  rating: number | null;
  ratingCount: number | null;
  openingHours: string[];
  types: string[];
}

export class PlacesNotConfigured extends Error {
  constructor() {
    super("GOOGLE_PLACES_API_KEY is not set.");
    this.name = "PlacesNotConfigured";
  }
}

export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

function key(): string {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new PlacesNotConfigured();
  return k;
}

async function call<T>(url: string, mask: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": mask,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Places ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/* Accra, so a search for "Republic" does not return one in another country. */
const ACCRA = { latitude: 5.6037, longitude: -0.187 };

/** Find candidate places by name. */
export async function searchPlaces(query: string): Promise<PlaceSummary[]> {
  const data = await call<{ places?: RawPlace[] }>(
    `${BASE}/places:searchText`,
    SEARCH_MASK,
    {
      textQuery: query,
      // A bias rather than a hard restriction: a venue just outside the radius
      // should still be findable, only ranked lower.
      locationBias: { circle: { center: ACCRA, radius: 40000 } },
      regionCode: "GH",
      languageCode: "en",
    }
  );

  return (data.places ?? []).map(toSummary);
}

export interface DiscoveredPlace extends PlaceSummary {
  lat: number | null;
  lng: number | null;
  priceLevel: string | null;
  rating: number | null;
  ratingCount: number | null;
  types: string[];
}

/**
 * Find venues we have never heard of.
 *
 * The catalogue was built by typing names someone already knew, which caps it
 * at one person's memory of the city. This asks Google what is actually in a
 * neighbourhood, so the work becomes triage, deciding which of twenty real
 * bars in Osu belong in the catalogue, rather than recall.
 *
 * It returns candidates and nothing else. Menus, prices and judgement about
 * who a place suits still come from us, so a discovered venue lands unpriced
 * and cannot appear in a plan until someone gives it a price.
 */
export async function discoverPlaces(
  what: string,
  area: string,
  opts: { openNow?: boolean } = {}
): Promise<DiscoveredPlace[]> {
  const data = await call<{ places?: RawPlace[] }>(
    `${BASE}/places:searchText`,
    DISCOVER_MASK,
    {
      textQuery: `${what} in ${area}, Accra, Ghana`,
      locationBias: { circle: { center: ACCRA, radius: 40000 } },
      regionCode: "GH",
      languageCode: "en",
      ...(opts.openNow ? { openNow: true } : {}),
    }
  );

  return (data.places ?? []).map((p) => ({
    ...toSummary(p),
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    priceLevel: p.priceLevel ?? null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    types: p.types ?? [],
  }));
}

/** Full detail for one place. */
export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  const p = await call<RawPlace>(
    `${BASE}/places/${encodeURIComponent(placeId)}`,
    DETAIL_MASK
  );

  const range = p.priceRange;
  return {
    ...toSummary(p),
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    googleMapsUri: p.googleMapsUri ?? null,
    website: p.websiteUri ?? null,
    phone: p.internationalPhoneNumber ?? null,
    priceLevel: p.priceLevel ?? null,
    priceRange: range
      ? {
          currency: range.startPrice?.currencyCode ?? range.endPrice?.currencyCode ?? "",
          min: range.startPrice ? Number(range.startPrice.units ?? 0) : null,
          max: range.endPrice ? Number(range.endPrice.units ?? 0) : null,
        }
      : null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    openingHours: p.regularOpeningHours?.weekdayDescriptions ?? [],
    types: p.types ?? [],
  };
}

/**
 * Status only, for the recurring sweep.
 *
 * Returns null when Google no longer knows the place at all, which is itself a
 * signal worth surfacing rather than an error worth throwing.
 */
export async function placeStatus(placeId: string): Promise<BusinessStatus | null> {
  try {
    const p = await call<RawPlace>(
      `${BASE}/places/${encodeURIComponent(placeId)}`,
      SWEEP_MASK
    );
    return (p.businessStatus as BusinessStatus) ?? null;
  } catch (e) {
    if (e instanceof Error && /Places 404/.test(e.message)) return null;
    throw e;
  }
}

/* ── mapping into our own vocabulary ──────────────────────────────────── */

/**
 * Google's price bucket to ours.
 *
 * Bucket to bucket, which is the only lossless thing to do with it. It must
 * never be turned into a per-person figure: plans show itemised orders and an
 * exact total, and a bucket midpoint dressed as an exact number is the same
 * failure as an unpriced venue costing nothing, only harder to spot.
 */
export function bandFromPriceLevel(level: string | null): PriceBand | null {
  switch (level) {
    case "PRICE_LEVEL_FREE":
    case "PRICE_LEVEL_INEXPENSIVE":
      return "budget";
    case "PRICE_LEVEL_MODERATE":
      return "mid";
    case "PRICE_LEVEL_EXPENSIVE":
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "premium";
    default:
      return null;
  }
}

/**
 * Google's place types to ours.
 *
 * Only confident mappings are listed; anything else returns null so an admin
 * chooses rather than being handed a wrong default that looks considered.
 */
const TYPE_MAP: Record<string, VenueType> = {
  restaurant: "restaurant",
  fine_dining_restaurant: "restaurant",
  buffet_restaurant: "restaurant",
  cafe: "cafe",
  cafeteria: "cafe",
  coffee_shop: "cafe",
  bakery: "cafe",
  tea_house: "cafe",
  bar: "lounge",
  // Named for the bar first, and used as a drinks stop even though it serves
  // food. Observed on The Republic and Venus Lounge in the Osu results.
  bar_and_grill: "lounge",
  lounge_bar: "lounge",
  night_club: "lounge",
  pub: "lounge",
  wine_bar: "lounge",
  ice_cream_shop: "dessert",
  dessert_shop: "dessert",
  dessert_restaurant: "dessert",
  chocolate_shop: "dessert",
  park: "outdoor",
  national_park: "outdoor",
  beach: "outdoor",
  garden: "outdoor",
  hiking_area: "outdoor",
  botanical_garden: "outdoor",
  tourist_attraction: "activity",
  bowling_alley: "activity",
  amusement_park: "activity",
  amusement_center: "activity",
  art_gallery: "activity",
  art_studio: "activity",
  museum: "activity",
  movie_theater: "activity",
  // Padel, tennis and the rest. Google returns both of these for Accra's
  // padel clubs, and without them a court was filed as a restaurant.
  sports_club: "activity",
  sports_activity_location: "activity",
  sports_complex: "activity",
  golf_course: "activity",
  karaoke: "activity",
  video_arcade: "activity",
  performing_arts_theater: "activity",
  cultural_center: "activity",
  event_venue: "activity",
};

export function venueTypeFromPlace(
  primaryType: string | null,
  types: string[] = []
): VenueType | null {
  if (primaryType && TYPE_MAP[primaryType]) return TYPE_MAP[primaryType];
  for (const t of types) {
    if (TYPE_MAP[t]) return TYPE_MAP[t];
  }
  return null;
}

/** True when Google says this place is not trading. */
export function isClosed(status: BusinessStatus | string | null): boolean {
  return status === "CLOSED_PERMANENTLY" || status === "CLOSED_TEMPORARILY";
}

/* ── wire shapes ──────────────────────────────────────────────────────── */

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  websiteUri?: string;
  internationalPhoneNumber?: string;
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
  priceLevel?: string;
  priceRange?: {
    startPrice?: { currencyCode?: string; units?: string };
    endPrice?: { currencyCode?: string; units?: string };
  };
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

function toSummary(p: RawPlace): PlaceSummary {
  return {
    id: p.id ?? "",
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    businessStatus: (p.businessStatus as BusinessStatus) ?? null,
    primaryType: p.primaryType ?? null,
  };
}
