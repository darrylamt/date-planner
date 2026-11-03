import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/adminAuth";
import { areaCentroids } from "@/lib/areaCentroids";
import { ensureAreaId } from "@/lib/areas";
import { readMapsLink } from "@/lib/mapsLink";
import { cityOf, findLodging, isClosed, matchArea, placeDetails, placesConfigured, searchPlaces, type PlaceDetails } from "@/lib/places";
import { GHANA_REGIONS, REGION_OF_TOWN, ROOM_TYPES, STAY_AMENITY_IDS, STAY_KINDS, regionFromAddress, stayKindFromTypes } from "@/lib/stays";
import { CITY_CENTRES } from "@/lib/neighbourhoods";
import { haversineKm } from "@/lib/transport";
import { areaForPlace } from "@/lib/venueFromPlace";

/**
 * Places to stay, for the admin and the stays team (0099).
 *
 *   locate: where a place is, from a Google place, a Maps link or a pin,
 *           with the region and town read from it.
 *   save:   the stay (a venue of type 'stay'), its details, rooms and photos.
 *   find:   the stay finder: places to stay Google lists near a Trips
 *           destination, with phone, website and Maps link, marked when
 *           we already hold them.
 *   import: those picked from the finder, made stays in one go: where,
 *           what kind, region and town, how to reach them. Rooms, rates
 *           and photos are then added on each stay's page.
 *
 * The writes run as the service role, so a staff login's are logged by hand
 * (staff_edits), as /api/admin/gaderin does.
 */
export const maxDuration = 30;

const clock = z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/).nullable();
const text = (max: number) => z.string().trim().max(max).nullable();

const room = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  room_type: z.enum(ROOM_TYPES.map((r) => r.id) as [string, ...string[]]),
  sleeps: z.number().int().min(1).max(30),
  price_per_night_ghs: z.number().min(0).max(1_000_000).nullable(),
  weekend_price_ghs: z.number().min(0).max(1_000_000).nullable(),
  breakfast_included: z.boolean(),
  units: z.number().int().min(1).max(500).nullable(),
  notes: text(500),
  is_active: z.boolean(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("locate"),
    placeId: z.string().min(4).max(400).optional(),
    link: z.string().max(600).optional(),
    lat: z.number().min(4).max(12).optional(),
    lng: z.number().min(-4).max(2).optional(),
  }),
  z.object({
    action: z.literal("save"),
    id: z.string().uuid().nullable(),
    name: z.string().trim().min(2).max(120),
    kind: z.enum(STAY_KINDS.map((k) => k.id) as [string, ...string[]]),
    region: z.enum(GHANA_REGIONS),
    town: text(80),
    address: text(300),
    area_id: z.string().uuid().nullable(),
    lat: z.number().min(4).max(12).nullable(),
    lng: z.number().min(-4).max(2).nullable(),
    google_maps_url: text(600),
    google_place_id: text(400),
    phone: text(40),
    whatsapp_phone: text(40),
    booking_url: text(600),
    email: text(200),
    description: z.string().trim().max(2000),
    image_url: text(1000),
    // The pictures after the cover, in the order shown (venues.gallery_urls).
    gallery_urls: z.array(z.string().trim().url().max(1000)).max(30).default([]),
    check_in: clock,
    check_out: clock,
    min_nights: z.number().int().min(1).max(60).nullable(),
    amenities: z.array(z.string()).max(40),
    activities: z.array(z.string().trim().min(1).max(60)).max(30),
    notes: text(2000),
    rates_checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    is_active: z.boolean(),
    rooms: z.array(room).max(40),
  }),
  z.object({ action: z.literal("find"), destination: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40) }),
  z.object({
    action: z.literal("import"),
    destination: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
    places: z
      .array(
        z.object({
          id: z.string().min(4).max(400),
          name: z.string().trim().min(2).max(120),
          address: z.string().max(300).default(""),
          lat: z.number().min(4).max(12),
          lng: z.number().min(-4).max(2),
          types: z.array(z.string().max(60)).max(40).default([]),
          rating: z.number().nullable().default(null),
          ratingCount: z.number().int().nullable().default(null),
          phone: z.string().max(40).nullable().default(null),
          website: z.string().max(600).nullable().default(null),
          googleMapsUri: z.string().max(600).nullable().default(null),
          addressParts: z.array(z.string().max(120)).max(20).default([]),
          localities: z.array(z.string().max(120)).max(10).default([]),
        })
      )
      .min(1)
      .max(40),
  }),
]);

/** The nearest of our towns, for filing a stay's area where no neighbourhood of ours is close. */
const nearestTown = (at: { lat: number; lng: number }) =>
  Object.entries(CITY_CENTRES).sort((a, b) => haversineKm(at, a[1]) - haversineKm(at, b[1]))[0][0];

/** What the form fills from a place: the pin, the link, the phone, the region and town. */
function facts(d: PlaceDetails) {
  const town = d.lat != null && d.lng != null ? cityOf({ lat: d.lat, lng: d.lng }) : null;
  return {
    placeId: d.id,
    name: d.name,
    address: d.address,
    lat: d.lat,
    lng: d.lng,
    googleMapsUri: d.googleMapsUri,
    phone: d.phone,
    website: d.website,
    region: regionFromAddress(d.addressParts) ?? (town ? (REGION_OF_TOWN[town] ?? null) : null),
    town: d.localities?.[0] ?? town,
  };
}

export async function POST(req: Request) {
  const gate = await requireStaff(["stays"]);
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const body = parsed.data;
  const db = gate.supabase;

  if (body.action === "locate") {
    try {
      if (body.placeId) return NextResponse.json({ place: facts(await placeDetails(body.placeId)) });
      if (body.link) {
        const link = await readMapsLink(body.link);
        if (!link) return NextResponse.json({ error: "That is not a Google Maps link." }, { status: 422 });
        if (placesConfigured()) {
          if (link.placeId) return NextResponse.json({ place: facts(await placeDetails(link.placeId)) });
          if (link.text) {
            const [hit] = await searchPlaces(link.text);
            if (hit) return NextResponse.json({ place: facts(await placeDetails(hit.id)) });
          }
        }
        if (link.lat == null || link.lng == null) {
          return NextResponse.json({ error: "Could not read a place or a pin from that link. Paste the coordinates instead." }, { status: 422 });
        }
        body.lat = link.lat;
        body.lng = link.lng;
      }
      if (body.lat != null && body.lng != null) {
        const town = cityOf({ lat: body.lat, lng: body.lng });
        return NextResponse.json({
          place: { lat: body.lat, lng: body.lng, town, region: town ? (REGION_OF_TOWN[town] ?? null) : null },
        });
      }
      return NextResponse.json({ error: "Give a Google place, a Maps link or coordinates." }, { status: 400 });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || "Could not read that location." }, { status: 502 });
    }
  }

  // ── find ───────────────────────────────────────────────────────────────
  if (body.action === "find" || body.action === "import") {
    if (!placesConfigured()) return NextResponse.json({ error: "Google Places is not configured. Add GOOGLE_PLACES_API_KEY." }, { status: 501 });
    const { data: dest } = await db.from("destinations").select("slug, name, region, town, lat, lng, radius_km").eq("slug", body.destination).maybeSingle();
    if (!dest || dest.lat == null || dest.lng == null) return NextResponse.json({ error: "That destination has no location yet." }, { status: 404 });
    const centre = { lat: Number(dest.lat), lng: Number(dest.lng) };
    // A stay a short ride out still serves the place: Busua's lodges, Kakum's, Wli's.
    const reachKm = Math.max(8, Number(dest.radius_km) * 1.5);

    if (body.action === "find") {
      try {
        const [found, { data: held }] = await Promise.all([
          findLodging(centre, reachKm, dest.town && dest.town !== dest.name ? `${dest.name}, ${dest.town}` : dest.name),
          db.from("venues").select("id, name, google_place_id").eq("type", "stay"),
        ]);
        const byPlace = new Map(((held ?? []) as { id: string; name: string; google_place_id: string | null }[]).filter((v) => v.google_place_id).map((v) => [v.google_place_id!, v.id]));
        const byName = new Map(((held ?? []) as { id: string; name: string }[]).map((v) => [v.name.trim().toLowerCase(), v.id]));
        const results = found
          .filter((p) => p.lat != null && p.lng != null && !isClosed(p.businessStatus))
          .map((p) => ({ ...p, km: Math.round(haversineKm(centre, { lat: p.lat!, lng: p.lng! }) * 10) / 10, kind: stayKindFromTypes(p.types), have: byPlace.get(p.id) ?? byName.get(p.name.trim().toLowerCase()) ?? null }))
          .filter((p) => p.km <= reachKm)
          .sort((a, b) => Number(Boolean(a.have)) - Number(Boolean(b.have)) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0));
        return NextResponse.json({ results, reachKm });
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message || "Google did not answer." }, { status: 502 });
      }
    }

    // ── import ──
    const centroids = await areaCentroids(db);
    const added: { id: string; name: string }[] = [];
    const failures: string[] = [];
    let skipped = 0;
    for (const p of body.places) {
      const { data: clash } = await db.from("venues").select("id").eq("google_place_id", p.id).maybeSingle();
      if (clash) {
        skipped++;
        continue;
      }
      const at = { lat: p.lat, lng: p.lng };
      const town = p.localities[0] ?? dest.town ?? dest.name;
      let areaId = matchArea(p.addressParts, centroids, at).existingId;
      if (!areaId) areaId = (await ensureAreaId(db, town, nearestTown(at)))?.id ?? null;
      if (!areaId) {
        failures.push(`${p.name}: could not place it in an area`);
        continue;
      }
      const { data: row, error } = await db
        .from("venues")
        .insert({
          name: p.name,
          type: "stay",
          area_id: areaId,
          lat: p.lat,
          lng: p.lng,
          google_place_id: p.id,
          google_maps_url: p.googleMapsUri,
          phone: p.phone,
          booking_url: p.website,
          description: "",
          is_active: true,
          price_band: "mid",
          place_rating: p.rating,
          place_rating_count: p.ratingCount,
          business_status: "OPERATIONAL",
          places_synced_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !row) {
        failures.push(`${p.name}: ${error?.message ?? "not saved"}`);
        continue;
      }
      const id = (row as { id: string }).id;
      const { error: detailsError } = await db.from("stay_details").insert({
        venue_id: id,
        kind: stayKindFromTypes(p.types),
        region: regionFromAddress(p.addressParts) ?? (dest.region as string),
        town,
        address: p.address || null,
        updated_by: gate.userId,
      });
      if (detailsError) failures.push(`${p.name}: saved, but its details did not: ${detailsError.message}`);
      added.push({ id, name: p.name });
      if (!gate.isAdmin) {
        await db.from("staff_edits").insert({ user_id: gate.userId, table_name: "stays", row_id: id, venue_id: id, action: "insert", changes: { name: p.name, from: "stay finder", destination: dest.slug } });
      }
    }
    return NextResponse.json({ added, skipped, failures });
  }

  // ── save ───────────────────────────────────────────────────────────────
  if (body.lat == null || body.lng == null) {
    return NextResponse.json({ error: "Add where it is: find it on Google, paste a Maps link, or type the coordinates." }, { status: 422 });
  }

  /*
   * The area: the one chosen, else the one Google's address or our nearby
   * venues give, else the town itself, since a lodge at Wli is nowhere near
   * any neighbourhood we hold.
   */
  let areaId = body.area_id;
  if (!areaId && body.google_place_id && placesConfigured()) {
    try {
      const d = await placeDetails(body.google_place_id);
      const m = await areaForPlace(db, d);
      areaId = m.existingId ?? (m.isNew && m.name ? ((await ensureAreaId(db, m.name, cityOf({ lat: body.lat, lng: body.lng }) ?? body.town ?? "Accra"))?.id ?? null) : null);
    } catch {
      /* fall through to the pin */
    }
  }
  if (!areaId) {
    const m = matchArea([], await areaCentroids(db), { lat: body.lat, lng: body.lng });
    areaId = m.existingId;
  }
  if (!areaId && body.town) areaId = (await ensureAreaId(db, body.town, cityOf({ lat: body.lat, lng: body.lng }) ?? body.town))?.id ?? null;
  if (!areaId) return NextResponse.json({ error: "Could not place it in an area. Pick one." }, { status: 422 });

  const cheapest = Math.min(...body.rooms.map((r) => r.price_per_night_ghs ?? Infinity));
  const venueRow = {
    name: body.name,
    type: "stay",
    area_id: areaId,
    lat: body.lat,
    lng: body.lng,
    google_maps_url: body.google_maps_url,
    google_place_id: body.google_place_id,
    phone: body.phone,
    whatsapp_phone: body.whatsapp_phone,
    booking_url: body.booking_url,
    description: body.description,
    image_url: body.image_url,
    gallery_urls: body.gallery_urls,
    is_active: body.is_active,
    // A night's rate says the band: under GHS 500 budget, over 1,500 premium.
    price_band: !Number.isFinite(cheapest) ? "mid" : cheapest < 500 ? "budget" : cheapest > 1500 ? "premium" : "mid",
  };

  let venueId = body.id;
  if (venueId) {
    const { error } = await db.from("venues").update(venueRow).eq("id", venueId).eq("type", "stay");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data, error } = await db.from("venues").insert(venueRow).select("id").single();
    if (error || !data) {
      const missing = /invalid input value for enum/.test(error?.message ?? "");
      return NextResponse.json({ error: missing ? "Run migration 0099 first." : (error?.message ?? "Could not save.") }, { status: 500 });
    }
    venueId = (data as { id: string }).id;
  }

  const { error: detailsError } = await db.from("stay_details").upsert({
    venue_id: venueId,
    kind: body.kind,
    region: body.region,
    town: body.town,
    address: body.address,
    email: body.email,
    check_in: body.check_in,
    check_out: body.check_out,
    min_nights: body.min_nights,
    amenities: body.amenities.filter((a) => STAY_AMENITY_IDS.includes(a)),
    activities: [...new Set(body.activities)],
    notes: body.notes,
    rates_checked_on: body.rates_checked_on,
    updated_by: gate.userId,
    updated_at: new Date().toISOString(),
  });
  if (detailsError) return NextResponse.json({ error: detailsError.message }, { status: 500 });

  // Rooms: the list as sent. Rooms taken off it go; the rest are written in order.
  const { data: had } = await db.from("stay_rooms").select("id").eq("venue_id", venueId);
  const keep = new Set(body.rooms.map((r) => r.id).filter(Boolean) as string[]);
  const gone = ((had ?? []) as { id: string }[]).map((r) => r.id).filter((id) => !keep.has(id));
  if (gone.length) await db.from("stay_rooms").delete().in("id", gone);
  const now = new Date().toISOString();
  for (const [i, r] of body.rooms.entries()) {
    const row = { ...r, venue_id: venueId, sort: i, updated_at: now };
    const { error } = r.id ? await db.from("stay_rooms").update(row).eq("id", r.id).eq("venue_id", venueId) : await db.from("stay_rooms").insert(row);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!gate.isAdmin) {
    await db.from("staff_edits").insert({
      user_id: gate.userId,
      table_name: "stays",
      row_id: venueId,
      venue_id: venueId,
      action: body.id ? "update" : "insert",
      changes: { name: body.name, region: body.region, town: body.town, rooms: body.rooms.length, removed_rooms: gone.length },
    });
  }
  return NextResponse.json({ ok: true, id: venueId });
}
