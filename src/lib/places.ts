import type { PriceBand, VenueType } from "./types";
import { parsePeriods, type OpeningPeriod } from "./hours";

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
  /*
   * Essentials tier, and this mask already reaches Enterprise through
   * regularOpeningHours and priceLevel. Billing is charged at the highest tier
   * the mask touches, so this is free to add and it is the only field that can
   * say which part of town a place is in.
   */
  "addressComponents",
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
  /**
   * The machine-readable half of the hours. weekdayDescriptions is for showing
   * a person; only these can answer "is it open at 20:00 next Monday".
   */
  openingPeriods: OpeningPeriod[] | null;
  /** Every place name Google attaches to the address, broadest last. */
  addressParts: string[];
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
    openingPeriods: parsePeriods(p.regularOpeningHours?.periods),
    addressParts: addressPartsOf(p),
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
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: OpeningPeriod[];
  };
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
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

/* ── where in town ────────────────────────────────────────────────────── */

/**
 * Every place name Google attaches to an address, narrowest first.
 *
 * Narrowest first matters. Google returns a nest of them, from a neighbourhood
 * up to the country, and the useful answer is almost always the smallest one
 * we recognise: "Labone" rather than "Greater Accra Region".
 */
const AREA_COMPONENT_ORDER = [
  "neighborhood",
  "sublocality_level_5",
  "sublocality_level_4",
  "sublocality_level_3",
  "sublocality_level_2",
  "sublocality_level_1",
  "sublocality",
  "locality",
  "administrative_area_level_3",
  "administrative_area_level_2",
];

function addressPartsOf(p: RawPlace): string[] {
  const comps = p.addressComponents ?? [];
  const out: string[] = [];

  for (const wanted of AREA_COMPONENT_ORDER) {
    for (const c of comps) {
      if (c.types?.includes(wanted) && c.longText) out.push(c.longText);
    }
  }

  /*
   * The street line too, because Accra's addresses carry the area in the road
   * name far more reliably than the administrative components do. Bliss comes
   * back as sublocality "Kpeshie", which is a sub-metro district nobody gives
   * as their location, while its address says "Airport Bypass Rd", and Airport
   * Residential is an area the catalogue actually has.
   */
  for (const c of comps) {
    if (c.types?.includes("route") && c.longText) out.push(c.longText);
  }
  if (p.formattedAddress) out.push(p.formattedAddress);

  return [...new Set(out.filter(Boolean))];
}

export interface AreaMatch {
  /** An existing area, when one could be identified. */
  existingId: string | null;
  /** What to call it. The existing name, or a proposal for a new one. */
  name: string | null;
  /** True when nothing matched and `name` is a suggestion to create. */
  isNew: boolean;
  /** Which rule decided, so the form can say rather than just fill. */
  reason: "address" | "nearby" | "proposed" | "none";
  /** Metres to the matched area's centre, when the decision was distance. */
  metres?: number;
  /**
   * Every area close enough to be plausible, nearest first.
   *
   * Populated when two areas are near enough to each other that the distance
   * cannot honestly choose between them. Cypher Zone sits 450m from the
   * Cantonments venues and 455m from the Labone ones; it is in Palace Mall
   * Labone, and five metres of arithmetic is not what should decide that. The
   * form offers the list instead of picking one and looking certain.
   */
  alternatives?: { id: string; name: string; metres: number }[];
}

export interface AreaForMatch {
  id: string;
  name: string;
  /** Centre of the area, averaged from the venues already filed under it. */
  lat?: number | null;
  lng?: number | null;
}

/** Metres between two points, flat-earth, which is ample across one city. */
function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (aLat - bLat) * 111_320;
  const dLng = (aLng - bLng) * 111_320 * Math.cos((aLat * Math.PI) / 180);
  return Math.round(Math.hypot(dLat, dLng));
}

/**
 * How far from an area's centre still counts as being in it.
 *
 * Two kilometres. Checked against the three venues this was built for: Bliss
 * is 90m from the Airport Residential venues, Cypher Zone is 455m from the
 * Labone ones, and Game It Up at Atomic Junction is 3.3km from anything we
 * hold, which is the right answer too, because it genuinely is somewhere new.
 */
const SAME_AREA_METRES = 2000;

/**
 * Which of our areas a place sits in.
 *
 * Google's vocabulary is not Accra's. Ask it where Cypher Zone is and it says
 * Kpeshie, a sub-metro district; ask anyone in Accra and they say Labone. Ask
 * about Bliss and it says Kpeshie again, though the two are four kilometres
 * apart. Filing venues under Google's names would fill the area list with
 * labels nobody would pick, and the area is what the planner groups stops by
 * and routes taxis between.
 *
 * So the address is only the first thing tried, and coordinates are the
 * fallback that actually works: an area's centre is the average of the venues
 * already filed under it, and a place within two kilometres of one is almost
 * certainly in it. Only when both fail does it propose a new name, which is
 * the honest outcome for somewhere genuinely in a new part of town.
 */
export function matchArea(
  addressParts: string[],
  areas: AreaForMatch[],
  point?: { lat: number | null; lng: number | null }
): AreaMatch {
  const haystack = addressParts.join(" | ").toLowerCase();

  /*
   * Longest name first, so "Airport Residential" wins over a bare "Airport"
   * if both exist. A shorter name is a substring of the longer one, and
   * matching it first would file the venue one level too coarse.
   */
  const byLength = [...areas].sort((a, b) => b.name.length - a.name.length);
  for (const area of byLength) {
    const needle = area.name.toLowerCase();
    if (needle.length >= 4 && haystack.includes(needle)) {
      return { existingId: area.id, name: area.name, isNew: false, reason: "address" };
    }
  }

  if (point?.lat != null && point?.lng != null) {
    const ranked = areas
      .filter((a) => a.lat != null && a.lng != null)
      .map((a) => ({
        id: a.id,
        name: a.name,
        metres: metresBetween(point.lat!, point.lng!, a.lat!, a.lng!),
      }))
      .sort((a, b) => a.metres - b.metres);

    const best = ranked[0];
    if (best && best.metres <= SAME_AREA_METRES) {
      /*
       * Anything within a quarter of the winner's distance is a tie as far as
       * this arithmetic is concerned, and is offered rather than discarded.
       */
      const close = ranked.filter(
        (r) => r.metres <= SAME_AREA_METRES && r.metres <= best.metres * 1.25 + 50
      );
      return {
        existingId: best.id,
        name: best.name,
        isNew: false,
        reason: "nearby",
        metres: best.metres,
        alternatives: close.length > 1 ? close : undefined,
      };
    }
  }

  /*
   * Nothing recognised. Offer the narrowest component that is not just the
   * city, since "Accra" as an area name tells the planner nothing it did not
   * already assume, and let the admin rename it before saving.
   */
  const proposal = addressParts.find(
    (part) =>
      part.length >= 3 &&
      part.length <= 40 &&
      !/^(accra|ghana|greater accra region)$/i.test(part.trim()) &&
      !/\d/.test(part) &&
      !part.includes(",")
  );
  return proposal
    ? { existingId: null, name: proposal, isNew: true, reason: "proposed" }
    : { existingId: null, name: null, isNew: false, reason: "none" };
}
