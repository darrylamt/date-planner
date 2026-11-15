/**
 * Cheap, well-liked local places to eat in Accra (growth plan, 13 Nov 2026:
 * plans under GHS 600 fail most, because the catalogue is short of chop bars,
 * waakye and kenkey spots).
 *
 *   npx tsx --env-file=.env.local scripts/add-cheap-places.ts --dry
 *   npx tsx --env-file=.env.local scripts/add-cheap-places.ts
 *
 * For each Accra area with venues: Google's chop bars, waakye, kenkey and
 * banku spots near its centre, open, rated 4.0+ by 30+ people, marked
 * inexpensive (or unpriced) by Google, not already held. At most 4 an area,
 * 60 in all, added through venueFromPlace as restaurants. Phone numbers wait
 * for approval (0004). No prices are made up: they plan only at a labelled
 * estimate until their menu prices are in (call list, menu reader).
 */
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../src/lib/fetchAll";
import { haversineKm } from "../src/lib/transport";
import { venueFromPlace } from "../src/lib/venueFromPlace";

const dry = process.argv.includes("--dry");
const PER_AREA = 4;
const TOTAL = 60;
const QUERIES = ["chop bar", "waakye", "kenkey", "banku and tilapia", "local Ghanaian food"];
const MASK = "places.id,places.displayName,places.rating,places.userRatingCount,places.businessStatus,places.primaryType,places.types,places.location,places.priceLevel,places.formattedAddress";
const NOT_FOOD = /lodging|hotel|supermarket|grocery|store|gas_station|bank/;

type Hit = { id: string; name: string; rating: number; count: number; type: string; price: string | null; lat: number; lng: number };

async function search(q: string, lat: number, lng: number): Promise<Hit[]> {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!, "X-Goog-FieldMask": MASK, "content-type": "application/json" },
    body: JSON.stringify({ textQuery: `${q} in Accra`, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 2500 } }, regionCode: "GH", languageCode: "en", maxResultCount: 10 }),
  });
  if (!r.ok) return [];
  const j = (await r.json()) as { places?: { id: string; displayName?: { text: string }; rating?: number; userRatingCount?: number; businessStatus?: string; primaryType?: string; types?: string[]; location?: { latitude: number; longitude: number }; priceLevel?: string }[] };
  return (j.places ?? [])
    .filter((p) => p.businessStatus === "OPERATIONAL" && p.location && !NOT_FOOD.test(p.primaryType ?? "") && /restaurant|food|meal|bar|cafe/.test(`${p.primaryType} ${(p.types ?? []).join(" ")}`))
    .map((p) => ({ id: p.id, name: p.displayName?.text ?? "", rating: p.rating ?? 0, count: p.userRatingCount ?? 0, type: p.primaryType ?? "", price: p.priceLevel ?? null, lat: p.location!.latitude, lng: p.location!.longitude }));
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const venues = await fetchAllRows<{ name: string; lat: number | null; lng: number | null; google_place_id: string | null; area_id: string | null; type: string }>((a, b) =>
    db.from("venues").select("name, lat, lng, google_place_id, area_id, type").order("id").range(a, b) as never
  );
  const held = new Set(venues.map((v) => v.google_place_id).filter(Boolean));
  const { data: areas } = await db.from("areas").select("id, name, city").eq("city", "Accra");
  // Each Accra area's centre, from the venues in it; areas with fewer than 3 are too thin to search around.
  const centres = ((areas ?? []) as { id: string; name: string }[])
    .map((a) => {
      const vs = venues.filter((v) => v.area_id === a.id && v.lat != null && v.lng != null);
      return vs.length >= 3 ? { name: a.name, lat: vs.reduce((s, v) => s + Number(v.lat), 0) / vs.length, lng: vs.reduce((s, v) => s + Number(v.lng), 0) / vs.length } : null;
    })
    .filter(Boolean) as { name: string; lat: number; lng: number }[];

  const chosen = new Map<string, Hit & { area: string }>();
  for (const c of centres) {
    const found = new Map<string, Hit>();
    for (const q of QUERIES) for (const h of await search(q, c.lat, c.lng)) found.set(h.id, h);
    const good = [...found.values()]
      .filter((h) => !held.has(h.id) && !chosen.has(h.id))
      .filter((h) => h.rating >= 4 && h.count >= 30)
      .filter((h) => !h.price || h.price === "PRICE_LEVEL_INEXPENSIVE")
      .filter((h) => haversineKm(c, h) <= 3)
      // Not a name we already hold nearby (a branch Google lists twice).
      .filter((h) => !venues.some((v) => v.lat != null && v.name.toLowerCase() === h.name.toLowerCase() && haversineKm({ lat: Number(v.lat), lng: Number(v.lng!) }, h) < 1))
      .sort((a, b) => b.rating * Math.log10(b.count) - a.rating * Math.log10(a.count))
      .slice(0, PER_AREA);
    for (const h of good) if (chosen.size < TOTAL) chosen.set(h.id, { ...h, area: c.name });
    if (good.length) console.log(`${c.name}: ${good.map((h) => `${h.name} (${h.rating}★ ${h.count}${h.price ? ", cheap" : ""})`).join("; ")}`);
  }
  console.log(`\n${chosen.size} to add${dry ? " (dry run, nothing written)" : ""}`);
  if (dry) return;

  let added = 0;
  for (const h of chosen.values()) {
    const res = await venueFromPlace(db, h.id, { type: "restaurant" });
    if (!res.ok) {
      console.log(`  ${h.name}: not added (${res.error})`);
      continue;
    }
    const { data: row } = await db.from("venues").select("phone").eq("id", res.venue.id).single();
    const patch: Record<string, unknown> = { price_band: "budget" };
    if ((row as { phone: string | null } | null)?.phone) Object.assign(patch, { phone: null, phone_pending: (row as { phone: string }).phone });
    await db.from("venues").update(patch).eq("id", res.venue.id);
    added++;
  }
  console.log(`added ${added}`);
}
main();
