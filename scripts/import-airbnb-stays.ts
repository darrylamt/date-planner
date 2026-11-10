/**
 * Stays read from Airbnb in the owner's browser (10 Nov 2026: "not just
 * hotels... resorts, stays, nice places on Airbnb"), from
 * scripts/data/airbnb-stays-2026-11.json.
 *
 *   npx tsx --env-file=.env.local scripts/import-airbnb-stays.ts --dry
 *   npx tsx --env-file=.env.local scripts/import-airbnb-stays.ts
 *
 * Airbnb shows, for dates, the total for the stay with its fees. Each room's
 * nightly price is that total over the nights, and its note says so with the
 * dates and the listing, so nobody mistakes it for a rack rate. The booking
 * link is the listing. A place already held (same name) is skipped.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { ensureAreaId } from "../src/lib/areas";
import { areaCentroids } from "../src/lib/areaCentroids";
import { CITY_CENTRES } from "../src/lib/neighbourhoods";
import { haversineKm } from "../src/lib/transport";
import { findPlaces } from "../src/lib/places";

const dry = process.argv.includes("--dry");
const NIGHTS = 2;
const DATES = "4–6 Dec 2026";
const READ = "2026-11-10";

type Entry = {
  dest: string;
  name: string;
  kind: string;
  town: string;
  lat: number | null;
  lng: number | null;
  google?: string;
  rating: string | null;
  url: string;
  rooms: { name: string; type: string; sleeps: number; total: number; id: string }[];
};

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const entries = JSON.parse(readFileSync("scripts/data/airbnb-stays-2026-11.json", "utf8")) as Entry[];
  const { data: dests } = await db.from("destinations").select("slug, region, lat, lng, radius_km");
  const destOf = new Map(((dests ?? []) as { slug: string; region: string; lat: number; lng: number; radius_km: number }[]).map((d) => [d.slug, d]));
  const centroids = await areaCentroids(db);
  void centroids;
  for (const e of entries) {
    if (e.lat == null && e.google) {
      const hit = (await findPlaces(e.google))[0];
      if (hit?.lat != null) {
        e.lat = hit.lat;
        e.lng = hit.lng;
      }
    }
    if (e.lat == null || e.lng == null) {
      console.log(`  ${e.name}: no location, skipped`);
      continue;
    }
    const d = destOf.get(e.dest);
    const km = d ? haversineKm({ lat: d.lat, lng: d.lng }, { lat: e.lat, lng: e.lng }) : null;
    const { data: held } = await db.from("venues").select("id").eq("type", "stay").ilike("name", e.name).maybeSingle();
    console.log(`  ${e.name} (${e.dest}${km != null ? `, ${km.toFixed(1)} km from its centre, radius ${d!.radius_km}` : ""})${held ? ": already held" : ""}: ${e.rooms.map((r) => `${r.name} GH¢${Math.round(r.total / NIGHTS)}/night`).join("; ")}`);
    if (dry || held) continue;
    const at = { lat: e.lat, lng: e.lng };
    const nearest = Object.entries(CITY_CENTRES).sort((a, b) => haversineKm(at, a[1]) - haversineKm(at, b[1]))[0][0];
    const area = await ensureAreaId(db, e.town, nearest);
    if (!area) {
      console.log("    no area, skipped");
      continue;
    }
    const { data: row, error } = await db
      .from("venues")
      .insert({
        name: e.name,
        type: "stay",
        area_id: area.id,
        lat: e.lat,
        lng: e.lng,
        booking_url: e.url,
        description: "",
        is_active: true,
        price_band: "mid",
        business_status: "OPERATIONAL",
      })
      .select("id")
      .single();
    if (error || !row) {
      console.log(`    not saved: ${error?.message}`);
      continue;
    }
    const id = (row as { id: string }).id;
    await db.from("stay_details").insert({
      venue_id: id,
      kind: e.kind,
      region: d?.region ?? "Greater Accra",
      town: e.town,
      rates_checked_on: READ,
      notes: `Listed on Airbnb${e.rating ? `, rated ${e.rating}` : ", new, no reviews yet"}. Prices are Airbnb's totals for ${DATES} (${NIGHTS} nights, with its fees) over the nights; they change with the dates. Read ${READ}.`,
    });
    const { error: re } = await db.from("stay_rooms").insert(
      e.rooms.map((r, i) => ({
        venue_id: id,
        name: r.name,
        room_type: r.type,
        sleeps: r.sleeps,
        price_per_night_ghs: Math.round(r.total / NIGHTS),
        breakfast_included: false,
        notes: `Airbnb GH¢${r.total.toLocaleString("en-US")} for ${DATES} (${NIGHTS} nights, with fees); https://www.airbnb.com/rooms/${r.id}; read ${READ}`,
        sort: i,
      }))
    );
    if (re) console.log(`    rooms not saved: ${re.message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
