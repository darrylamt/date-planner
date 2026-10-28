import type { SupabaseClient } from "@supabase/supabase-js";
import { areaCentroids } from "./areaCentroids";
import { ensureAreaId } from "./areas";
import { bandFromPriceLevel, cityOf, matchArea, neighbourhoodOf, placeDetails, venueTypeFromPlace, type AreaMatch, type PlaceDetails } from "./places";
import type { VenueType } from "./types";

/**
 * The area a Google place belongs in, read the way the venue form reads it
 * (VenueForm.applyPlace): in Accra from the address and the venues already
 * filed nearby; elsewhere, where we hold few areas, from the finer name Google
 * gives (a neighbourhood, else the district, else the town).
 */
export async function areaForPlace(db: SupabaseClient, d: PlaceDetails): Promise<AreaMatch> {
  const centres = await areaCentroids(db);
  const city = d.lat != null && d.lng != null ? cityOf({ lat: d.lat, lng: d.lng }) : null;
  const finer =
    city && city !== "Accra"
      ? neighbourhoodOf({ addressParts: d.addressParts, localities: d.localities ?? [] }, city, centres, { lat: d.lat, lng: d.lng })
      : null;
  if (finer) {
    const id = finer.existing ? (centres.find((a) => a.name.toLowerCase() === finer.name.toLowerCase())?.id ?? null) : null;
    return id ? { existingId: id, name: finer.name, isNew: false, reason: "address" } : { existingId: null, name: finer.name, isNew: true, reason: "proposed" };
  }
  return matchArea(d.addressParts, centres, { lat: d.lat, lng: d.lng });
}

export interface PlacedVenue {
  id: string;
  name: string;
  type: VenueType;
  area_id: string;
  area_name: string;
  /** False when this Google place was already one of ours: the existing row came back. */
  created: boolean;
}

/**
 * A venue made from a Google place, in one step, for the forms that need a
 * venue that is not ours yet: an event at a new place, a new stay. Google's
 * facts (where, the phone, the hours, still trading) come in; what Google has
 * no opinion on (the menu, the feel, the photos) is left for later, as the
 * venue form leaves it. A place we already hold comes back as it is.
 */
export async function venueFromPlace(
  db: SupabaseClient,
  placeId: string,
  opts: { type?: VenueType } = {}
): Promise<{ ok: true; venue: PlacedVenue } | { ok: false; error: string }> {
  const { data: known } = await db.from("venues").select("id, name, type, area_id, areas(name)").eq("google_place_id", placeId).maybeSingle();
  if (known) {
    const k = known as unknown as { id: string; name: string; type: VenueType; area_id: string; areas: { name: string } | null };
    return { ok: true, venue: { id: k.id, name: k.name, type: k.type, area_id: k.area_id, area_name: k.areas?.name ?? "", created: false } };
  }

  const d = await placeDetails(placeId);
  if (d.businessStatus === "CLOSED_PERMANENTLY") return { ok: false, error: "Google says that place has closed for good." };
  const type = opts.type ?? venueTypeFromPlace(d.primaryType, d.types);
  if (!type) return { ok: false, error: "Could not tell what kind of place this is. Add it from Venues instead." };

  const match = await areaForPlace(db, d);
  let areaId = match.existingId;
  let areaName = match.name ?? "";
  if (!areaId && match.isNew && match.name) {
    const city = d.lat != null && d.lng != null ? (cityOf({ lat: d.lat, lng: d.lng }) ?? "Accra") : "Accra";
    const made = await ensureAreaId(db, match.name, city);
    areaId = made?.id ?? null;
  }
  if (!areaId) return { ok: false, error: "Could not work out which area it is in. Add it from Venues, where you can pick one." };
  if (!areaName) {
    const { data: a } = await db.from("areas").select("name").eq("id", areaId).maybeSingle();
    areaName = (a as { name?: string } | null)?.name ?? "";
  }

  const { data: row, error } = await db
    .from("venues")
    .insert({
      name: d.name,
      type,
      area_id: areaId,
      price_band: bandFromPriceLevel(d.priceLevel) ?? "mid",
      phone: d.phone,
      google_maps_url: d.googleMapsUri,
      lat: d.lat,
      lng: d.lng,
      google_place_id: d.id,
      business_status: d.businessStatus,
      price_level: d.priceLevel,
      opening_periods: d.openingPeriods,
      opening_hours_text: d.openingHours?.length ? d.openingHours : null,
      hours_synced_at: d.openingPeriods ? new Date().toISOString() : null,
      place_rating: d.rating,
      place_rating_count: d.ratingCount,
      places_synced_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? "Could not save the venue." };
  return { ok: true, venue: { id: (row as { id: string }).id, name: d.name, type, area_id: areaId, area_name: areaName, created: true } };
}
