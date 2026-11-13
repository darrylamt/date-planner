/**
 * What each destination has and lacks for a trip, and the nearest ready
 * destination it could be a day trip from. Read-only.
 *   npx tsx --env-file=.env.local scripts/trip-readiness.ts
 */
import { createClient } from "@supabase/supabase-js";
import { haversineKm } from "../src/lib/transport";
import { missingFor, routesTo, type Destination, type IntercityRoute } from "../src/lib/trips";
import { fetchAllRows } from "../src/lib/fetchAll";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

type P = { id: string; type: string; lat: number | null; lng: number | null; entry_fee_ghs: number | null; is_free: boolean; stay_rooms?: { price_per_night_ghs: number | null; is_active: boolean }[] };

async function main() {
  const [{ data: dests }, { data: routes }, venues] = await Promise.all([
    db.from("destinations").select("*").eq("is_active", true).order("sort"),
    db.from("intercity_routes").select("*").eq("is_active", true),
    fetchAllRows<P>((a, b) => db.from("venues").select("id, type, lat, lng, entry_fee_ghs, is_free, stay_rooms(price_per_night_ghs, is_active)").eq("is_active", true).order("id").range(a, b)),
  ]);
  const all = dests as Destination[];
  const near = (d: Destination, p: P, km = Number(d.radius_km)) =>
    d.lat != null && p.lat != null && p.lng != null && haversineKm({ lat: Number(d.lat), lng: Number(d.lng) }, { lat: Number(p.lat), lng: Number(p.lng) }) <= km;
  const rows = all.map((d) => {
    const here = venues.filter((v) => near(d, v));
    const c = {
      venues: here.filter((v) => v.type !== "stay").length,
      sights: here.filter((v) => v.type === "activity" || v.type === "outdoor").length,
      pricedSights: here.filter((v) => (v.type === "activity" || v.type === "outdoor") && (v.entry_fee_ghs != null || v.is_free)).length,
      stays: here.filter((v) => v.type === "stay").length,
      pricedStays: here.filter((v) => v.type === "stay" && (v.stay_rooms ?? []).some((r) => r.is_active && r.price_per_night_ghs != null)).length,
      routes: routesTo(d, routes as IntercityRoute[]).length,
    };
    return { d, c, missing: missingFor(c) };
  });
  const ready = rows.filter((r) => !r.missing.length);
  for (const r of rows) {
    const base = ready
      .filter((b) => b.d.slug !== r.d.slug)
      .map((b) => ({ slug: b.d.slug, km: Math.round(haversineKm({ lat: Number(r.d.lat), lng: Number(r.d.lng) }, { lat: Number(b.d.lat), lng: Number(b.d.lng) })) }))
      .sort((a, b) => a.km - b.km)[0];
    console.log(
      [r.d.slug.padEnd(16), `r${r.d.radius_km}`, `gw:${r.d.gateway_town}`, JSON.stringify(r.c), r.missing.length ? `MISSING ${r.missing.join("; ")}` : "READY", r.missing.length && base ? `nearest ready: ${base.slug} ${base.km}km` : ""].join("  ")
    );
  }
}
main();
