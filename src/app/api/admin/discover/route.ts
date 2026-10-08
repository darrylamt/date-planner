import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { ensureAreaId } from "@/lib/areas";
import {
  PlacesNotConfigured,
  bandFromPriceLevel,
  discoverPlaces,
  neighbourhoodOf,
  placesConfigured,
  venueTypeFromPlace,
  type AreaForMatch,
} from "@/lib/places";

/**
 * Find venues in an area, and add the ones worth having.
 *
 * The catalogue was built from names someone already knew, which caps it at
 * one person's memory of the city. This turns the job into triage.
 *
 * Discovered venues are created deliberately incomplete: no price, no menu, no
 * vibe tags. They land in the unpriced queue and cannot reach a plan until a
 * human gives them a price, because Google knows a place exists but not what
 * an evening there costs.
 *
 * And switched off. The app lists a city as soon as anything active is in
 * it, so the first venues added in a new town would have put it in front of
 * users with nothing behind it. A priced menu switches a venue on by itself
 * (0078), which is the moment it can actually be planned.
 *
 * Any city or town in Ghana. The area is optional: leave it blank to search
 * the whole town, and each result is filed under the neighbourhood Google
 * gives it, with the neighbourhoods found offered back as places to look next.
 */
export const maxDuration = 60;

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("search"),
    what: z.string().min(2).max(80),
    city: z.string().min(2).max(60).default("Accra"),
    area: z.string().max(80).default(""),
  }),
  z.object({
    action: z.literal("add"),
    city: z.string().min(2).max(60).default("Accra"),
    area: z.string().max(80).default(""),
    places: z
      .array(
        z.object({
          id: z.string().min(4),
          name: z.string().min(1),
          address: z.string().default(""),
          lat: z.number().nullable().default(null),
          lng: z.number().nullable().default(null),
          priceLevel: z.string().nullable().default(null),
          primaryType: z.string().nullable().default(null),
          types: z.array(z.string()).default([]),
          /** The neighbourhood this one is filed under, from its address. */
          area: z.string().max(80).nullable().default(null),
        })
      )
      .min(1)
      .max(40),
  }),
]);

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  if (!placesConfigured()) {
    return NextResponse.json(
      { error: "Google Places is not configured. Add GOOGLE_PLACES_API_KEY." },
      { status: 501 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { supabase } = gate;

  try {
    if (body.action === "search") {
      const city = body.city.trim();
      const found = await discoverPlaces(body.what, body.area, { city });

      // The city's areas, with their centres, to file each result under.
      const [{ data: areas }, { data: pins }, { data: existing }] = await Promise.all([
        supabase.from("areas").select("id, name, city"),
        supabase.from("venues").select("area_id, lat, lng").not("lat", "is", null),
        // Mark what we already hold, by place id and by name.
        supabase.from("venues").select("google_place_id, name"),
      ]);
      const sums = new Map<string, { lat: number; lng: number; n: number }>();
      for (const v of (pins ?? []) as { area_id: string; lat: number; lng: number }[]) {
        const s = sums.get(v.area_id) ?? { lat: 0, lng: 0, n: 0 };
        s.lat += Number(v.lat);
        s.lng += Number(v.lng);
        s.n++;
        sums.set(v.area_id, s);
      }
      const inCity: AreaForMatch[] = ((areas ?? []) as { id: string; name: string; city: string | null }[])
        .filter((a) => (a.city || "Accra").toLowerCase() === city.toLowerCase())
        .map((a) => {
          const s = sums.get(a.id);
          return { id: a.id, name: a.name, lat: s ? s.lat / s.n : null, lng: s ? s.lng / s.n : null };
        });

      const haveIds = new Set(
        (existing ?? []).map((v: { google_place_id: string | null }) => v.google_place_id).filter(Boolean)
      );
      const haveNames = new Set((existing ?? []).map((v: { name: string }) => v.name.trim().toLowerCase()));

      const results = found.map(({ addressParts, localities, ...p }) => {
        let where = neighbourhoodOf({ addressParts, localities }, city, inCity, { lat: p.lat, lng: p.lng });
        /*
         * Accra's areas are the catalogue's own, so when the address matched
         * none of them the area searched is the better guess than a district
         * name ("La Dade-Kotopon") that nobody gives as their location.
         */
        if (city.toLowerCase() === "accra" && !where?.existing && body.area.trim()) {
          const typed = inCity.find((a) => a.name.toLowerCase() === body.area.trim().toLowerCase());
          where = { name: typed?.name ?? body.area.trim(), existing: Boolean(typed) };
        }
        return {
          ...p,
          area: where?.name ?? null,
          areaKnown: where?.existing ?? false,
          already: haveIds.has(p.id) || haveNames.has(p.name.trim().toLowerCase()),
        };
      });

      // The neighbourhoods the town turned up, busiest first: where to look next.
      const tally = new Map<string, number>();
      for (const r of results) if (r.area) tally.set(r.area, (tally.get(r.area) ?? 0) + 1);
      const neighbourhoods = [...tally].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

      return NextResponse.json({ results, neighbourhoods });
    }

    /* ── add ── */
    /*
     * Each under its own neighbourhood, in this city: the one its address
     * gave, else the area searched, else the town itself.
     */
    const city = body.city.trim();
    const resolved = new Map<string, { id: string; created: boolean } | null>();
    const areaFor = async (name: string | null) => {
      for (const candidate of [name, body.area, city]) {
        const key = (candidate ?? "").trim();
        if (!key) continue;
        if (!resolved.has(key.toLowerCase())) resolved.set(key.toLowerCase(), await ensureAreaId(supabase, key, city));
        const hit = resolved.get(key.toLowerCase());
        if (hit) return hit;
      }
      return null;
    };

    let added = 0;
    let skipped = 0;
    let areasCreated = 0;
    const failures: string[] = [];

    for (const p of body.places) {
      const area = await areaFor(p.area);
      if (!area) {
        failures.push(`${p.name}: could not work out its area`);
        continue;
      }
      const { data: clash } = await supabase
        .from("venues")
        .select("id")
        .eq("google_place_id", p.id)
        .maybeSingle();

      if (clash) {
        skipped++;
        continue;
      }

      const { error } = await supabase.from("venues").insert({
        name: p.name,
        area_id: area.id,
        // Left to the admin when Google's type does not map cleanly; a wrong
        // default here quietly puts a bar in the dinner slot.
        type: venueTypeFromPlace(p.primaryType, p.types) ?? "restaurant",
        price_band: bandFromPriceLevel(p.priceLevel) ?? "mid",
        // No price on purpose. Google has no menu, and a venue with no price
        // is withheld from planning rather than treated as free.
        avg_cost_per_person_ghs: 0,
        description: "",
        vibe_tags: [],
        best_for: [],
        reservation_required: false,
        // Off until its menu goes in, which switches it on (0078).
        is_active: false,
        lat: p.lat,
        lng: p.lng,
        google_place_id: p.id,
        business_status: "OPERATIONAL",
        price_level: p.priceLevel,
        places_synced_at: new Date().toISOString(),
      });

      if (error) failures.push(`${p.name}: ${error.message}`);
      else added++;
    }

    areasCreated = [...resolved.values()].filter((a) => a?.created).length;
    return NextResponse.json({ added, skipped, failures, areasCreated });
  } catch (e) {
    if (e instanceof PlacesNotConfigured) {
      return NextResponse.json({ error: e.message }, { status: 501 });
    }
    console.error("discovery failed", e);
    return NextResponse.json(
      { error: (e as Error).message ?? "Discovery failed." },
      { status: 502 }
    );
  }
}
