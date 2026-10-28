import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/adminAuth";
import { areaCentroids } from "@/lib/areaCentroids";
import { ensureAreaId } from "@/lib/areas";
import { readMapsLink } from "@/lib/mapsLink";
import { cityOf, matchArea, placeDetails, placesConfigured, searchPlaces, type PlaceDetails } from "@/lib/places";
import { GHANA_REGIONS, REGION_OF_TOWN, ROOM_TYPES, STAY_AMENITY_IDS, STAY_KINDS, regionFromAddress } from "@/lib/stays";
import { areaForPlace } from "@/lib/venueFromPlace";

/**
 * Places to stay, for the admin and the stays team (0099).
 *
 *   locate: where a place is, from a Google place, a Maps link or a pin,
 *           with the region and town read from it.
 *   save:   the stay (a venue of type 'stay'), its details and its rooms.
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
]);

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
