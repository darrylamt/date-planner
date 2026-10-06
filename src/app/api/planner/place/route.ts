import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isMapsLink, readMapsLink } from "@/lib/mapsLink";
import {
  PlacesNotConfigured,
  cityOf,
  confirmAreaName,
  findPlaces,
  matchArea,
  metresBetweenPoints,
  placeDetails,
  placeFromLink,
  venueTypeFromPlace,
  type PlaceDetails,
} from "@/lib/places";
import { areaCentroids } from "@/lib/areaCentroids";
import { ensureAreaId, isNeighbourhood } from "@/lib/areas";
import { logPlannerActivity } from "@/lib/plannerActivity";

/**
 * An event planner adding a place that is not on Duro yet, found on Google.
 *
 * The Google Maps link is the thing that matters: it is what makes the fare
 * from the last stop a real number and the place reachable at all. So the
 * place is found from the link (or by name on Google), and its coordinates,
 * address and Maps link come from Google's record, never from the browser.
 *
 * The part of town can be anything, not only one already on the list, but a
 * new one has to be a neighbourhood Google knows within seven kilometres of
 * the place. That is the check that keeps the area list made of places
 * people actually say, rather than whatever was typed.
 *
 * Writes go through the service role because a planner may not read most
 * venue columns or create areas; this route decides exactly what is written,
 * and gives the planner the same grant 0046's trigger would.
 */
export const maxDuration = 30;

const TYPES = ["lounge", "outdoor", "activity", "restaurant", "cafe", "dessert", "wellness"] as const;

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("find"), input: z.string().trim().min(2).max(600) }),
  z.object({ action: z.literal("pick"), placeId: z.string().min(4).max(400) }),
  z.object({ action: z.literal("area"), name: z.string().trim().min(2).max(40), lat: z.number(), lng: z.number() }),
  z.object({
    action: z.literal("create"),
    placeId: z.string().min(4).max(400).nullable(),
    link: z.string().max(600).nullable(),
    name: z.string().trim().min(2).max(80),
    type: z.enum(TYPES),
    description: z.string().max(300).default(""),
    image: z.string().max(600).default(""),
    areaId: z.string().uuid().nullable(),
    newArea: z.string().trim().max(40).nullable(),
  }),
]);

type Db = ReturnType<typeof createServiceClient>;

/** What the form needs to show a found place and file it. */
async function describe(db: Db, details: PlaceDetails | null, pin: { lat: number; lng: number }, link: string | null) {
  const city = cityOf(pin);
  const areas = await areaCentroids(db);
  const match = matchArea(details?.addressParts ?? [], areas, pin);

  // Already on Duro: the same Google place, or the same name a stone's throw away.
  let existing: { id: string; name: string; area: string } | null = null;
  // The very link somebody already gave us for a venue.
  if (link) {
    const { data } = await db.from("venues").select("id, name, areas(name)").eq("google_maps_url", link).limit(1);
    const row = (data?.[0] ?? null) as { id: string; name: string; areas: { name: string } | null } | null;
    if (row) existing = { id: row.id, name: row.name, area: row.areas?.name ?? "" };
  }
  if (!existing && details?.id) {
    const { data } = await db.from("venues").select("id, name, is_active, areas(name)").eq("google_place_id", details.id).limit(1);
    const row = (data?.[0] ?? null) as { id: string; name: string; is_active: boolean; areas: { name: string } | null } | null;
    if (row) existing = { id: row.id, name: row.name, area: row.areas?.name ?? "" };
  }
  /*
   * Most of the catalogue was added before Google ids were kept, so the same
   * name within 300 metres counts too. Matched on the name's first word, which
   * Google and the catalogue usually share ("Daddy Boba! - East Legon" and
   * "Daddy boba").
   */
  if (!existing && details?.name) {
    const word = details.name.split(/[^A-Za-z0-9']+/).find((w) => w.length >= 3);
    if (word) {
      const { data } = await db.from("venues").select("id, name, lat, lng, areas(name)").ilike("name", `%${word}%`).not("lat", "is", null).limit(30);
      const near = ((data ?? []) as unknown as { id: string; name: string; lat: number; lng: number; areas: { name: string } | null }[]).find(
        (v) => metresBetweenPoints(pin, { lat: Number(v.lat), lng: Number(v.lng) }) <= 300
      );
      if (near) existing = { id: near.id, name: near.name, area: near.areas?.name ?? "" };
    }
  }

  return {
    placeId: details?.id ?? null,
    name: details?.name ?? "",
    address: details?.address ?? "",
    lat: pin.lat,
    lng: pin.lng,
    mapsUrl: details?.googleMapsUri ?? link,
    type: venueTypeFromPlace(details?.primaryType ?? null, details?.types ?? []) ?? "lounge",
    city,
    area: match.existingId ? { id: match.existingId, name: match.name ?? "" } : null,
    areaProposal: match.isNew && match.name && isNeighbourhood(match.name) ? match.name : null,
    existing,
  };
}

export async function POST(req: Request) {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again, then try once more." }, { status: 401 });

  const db = createServiceClient();
  const { data: planner } = await db.from("event_planners").select("is_active").eq("user_id", user.id).maybeSingle();
  if (!planner) return NextResponse.json({ error: "Places are added from planner accounts." }, { status: 403 });

  let b: z.infer<typeof body>;
  try {
    b = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Something in that form is missing." }, { status: 400 });
  }

  try {
    if (b.action === "find") {
      if (isMapsLink(b.input)) {
        const facts = await readMapsLink(b.input);
        if (!facts) {
          return NextResponse.json({ kind: "need-name", message: "We could not open that link. In Google Maps, tap Share, then Copy link, and paste that. Or type the place's name." });
        }
        if (facts.cidOnly) {
          return NextResponse.json({ kind: "need-name", message: "That kind of Maps link does not say which place it is. Type the place's name and pick it from the list." });
        }
        const details = await placeFromLink(facts);
        const point = details?.lat != null && details?.lng != null ? { lat: details.lat, lng: details.lng } : facts.lat != null && facts.lng != null ? { lat: facts.lat, lng: facts.lng } : null;
        if (!point) {
          return NextResponse.json({ kind: "need-name", message: "We could not find that place on Google. Type its name and pick it from the list." });
        }
        // A dropped pin, with no Google listing: a lawn, a rooftop, a car park.
        return NextResponse.json({ kind: details ? "place" : "pin", place: await describe(db, details, point, b.input.trim()) });
      }

      const results = (await findPlaces(b.input))
        .filter((r) => r.lat != null && r.lng != null && cityOf({ lat: r.lat, lng: r.lng }))
        .map((r) => ({ id: r.id, name: r.name, address: r.address }));
      return NextResponse.json({ kind: "results", results });
    }

    if (b.action === "pick") {
      const details = await placeDetails(b.placeId);
      if (details.lat == null || details.lng == null) {
        return NextResponse.json({ error: "Google has no location for that place. Try another." }, { status: 422 });
      }
      return NextResponse.json({ kind: "place", place: await describe(db, details, { lat: details.lat, lng: details.lng }, null) });
    }

    if (b.action === "area") {
      const { data: known } = await db.from("areas").select("id, name").ilike("name", b.name).maybeSingle();
      if (known) return NextResponse.json({ ok: true, area: known });
      if (!isNeighbourhood(b.name)) {
        return NextResponse.json({ ok: false, message: `${b.name} is a district. Use the neighbourhood people would say, like East Legon or Osu.` });
      }
      const confirmed = await confirmAreaName(b.name, { lat: b.lat, lng: b.lng });
      if (!confirmed) {
        return NextResponse.json({ ok: false, message: `Google does not know a ${b.name} near this place. Check the spelling, or pick one from the list.` });
      }
      const { data: same } = await db.from("areas").select("id, name").ilike("name", confirmed.name).maybeSingle();
      return NextResponse.json({ ok: true, area: same ?? { id: null, name: confirmed.name } });
    }

    /* create */
    if (!planner.is_active) {
      return NextResponse.json({ error: "Your account is switched off. Get in touch with us under Help." }, { status: 403 });
    }

    // Where it is, from Google, never from the browser.
    let details: PlaceDetails | null = null;
    let point: { lat: number; lng: number } | null = null;
    if (b.placeId) {
      details = await placeDetails(b.placeId);
      if (details.lat != null && details.lng != null) point = { lat: details.lat, lng: details.lng };
    } else if (b.link) {
      const facts = await readMapsLink(b.link);
      if (facts?.lat != null && facts.lng != null) point = { lat: facts.lat, lng: facts.lng };
    }
    if (!point) return NextResponse.json({ error: "Find the place on Google Maps first." }, { status: 422 });

    const city = cityOf(point);
    if (!city) return NextResponse.json({ error: "That place is outside Ghana." }, { status: 422 });

    if (details?.id) {
      const { data: dupe } = await db.from("venues").select("id, name").eq("google_place_id", details.id).limit(1);
      if (dupe?.length) {
        return NextResponse.json({ error: `${dupe[0].name} is already on Duro. Pick it when you put your night on.` }, { status: 409 });
      }
    }

    let areaId: string | null = null;
    if (b.areaId) {
      const { data: area } = await db.from("areas").select("id").eq("id", b.areaId).maybeSingle();
      areaId = area?.id ?? null;
    } else if (b.newArea) {
      const confirmed = isNeighbourhood(b.newArea) ? await confirmAreaName(b.newArea, point) : null;
      if (!confirmed) return NextResponse.json({ error: `Google does not know a ${b.newArea} near this place.` }, { status: 422 });
      const made = await ensureAreaId(db, confirmed.name, city);
      areaId = made?.id ?? null;
      if (made?.created) {
        await logPlannerActivity({
          userId: user.id,
          action: "area.create",
          entityId: made.id,
          summary: `Added ${confirmed.name} as a part of town (${city}), ${Math.round(confirmed.metres / 100) / 10}km from Google's centre for it`,
        });
      }
    }
    if (!areaId) return NextResponse.json({ error: "Choose the part of town it is in." }, { status: 422 });

    const { data: venue, error } = await db
      .from("venues")
      .insert({
        name: b.name,
        type: b.type,
        area_id: areaId,
        description: b.description.trim(),
        image_url: b.image.trim() || null,
        google_maps_url: details?.googleMapsUri ?? b.link,
        google_place_id: details?.id ?? null,
        lat: point.lat,
        lng: point.lng,
        ...(details?.businessStatus ? { business_status: details.businessStatus } : {}),
        is_active: true,
      })
      .select("id, name, area_id, areas(name)")
      .single();
    if (error || !venue) {
      console.error("planner place insert failed", error);
      return NextResponse.json({ error: "We could not add that place. Try again." }, { status: 500 });
    }

    // Theirs, as 0046's trigger would have made it had they inserted it themselves.
    const { error: grantError } = await db.from("venue_users").insert({ user_id: user.id, venue_id: venue.id, created_by: user.id });
    if (grantError) console.error("planner place grant failed", grantError);

    const v = venue as unknown as { id: string; name: string; area_id: string; areas: { name: string } | null };
    await logPlannerActivity({
      userId: user.id,
      action: "place.create",
      entityId: v.id,
      summary: `Added ${v.name}, ${v.areas?.name ?? "no area"}${details?.id ? "" : " (a pin with no Google listing)"}`,
      changes: { type: [null, b.type], google_maps_url: [null, details?.googleMapsUri ?? b.link], address: [null, details?.address ?? null] },
    });
    return NextResponse.json({ place: { id: v.id, name: v.name, area_id: v.area_id, area: v.areas?.name ?? "", mine: true } });
  } catch (e) {
    if (e instanceof PlacesNotConfigured) {
      return NextResponse.json({ error: "Finding places on Google is not set up yet. Tell us under Help." }, { status: 501 });
    }
    console.error("planner place", e);
    return NextResponse.json({ error: "Google did not answer just now. Try again in a moment." }, { status: 502 });
  }
}
