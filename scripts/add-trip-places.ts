/**
 * Places to go around each Trips destination (owner, 10 Nov 2026: add the
 * best-reviewed restaurants, cafes and sights; trip days outside Accra may
 * use them at a labelled estimate).
 *
 *   npx tsx --env-file=.env.local scripts/add-trip-places.ts --dry
 *   npx tsx --env-file=.env.local scripts/add-trip-places.ts
 *
 * For each destination short of the six places "ready" asks for: Google's
 * restaurants, cafes, bars and sights inside its radius, open, rated 4.0 or
 * more by at least 15 people (8 in small towns, where fewer review), not
 * already held. The best are added through venueFromPlace, as the admin's
 * forms do (area, type, price band, hours, rating), at least half of them
 * places to eat or drink, which trip days can use at an estimate. Each phone
 * number waits behind 0004's gate. Descriptions and photos come after, from
 * describe-venues.ts and venue-photos.ts.
 */
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../src/lib/fetchAll";
import { haversineKm } from "../src/lib/transport";
import { venueFromPlace } from "../src/lib/venueFromPlace";

const dry = process.argv.includes("--dry");
// How many places a destination should hold: 6 makes it ready; more keeps a two-night trip from running out (--target 14).
const targetAt = process.argv.indexOf("--target");
const TARGET = targetAt >= 0 ? Number(process.argv[targetAt + 1]) : 6;
const MASK = "places.id,places.formattedAddress,places.displayName,places.rating,places.userRatingCount,places.businessStatus,places.primaryType,places.types,places.location";
const FOOD = /restaurant|cafe|coffee|bar|pub|lounge|bakery|food|grill|pizza|dessert|ice_cream|night_club/;
const SIGHT = /tourist_attraction|museum|park|historical|landmark|zoo|wildlife|hiking|beach|waterfall|art_gallery|cultural|monument|amusement/;

const GENERIC_WORDS = new Set("restaurant restaurants lounge lounges kitchen grill grills house garden gardens beach resort hotel ghana accra national waterfall waterfalls falls mountain mount ancient village tours sunset lagoon chief chiefs palace market street centre center coffee cafe bakery club pizza local catering services".split(" "));

type Hit = { id: string; name: string; rating: number; count: number; type: string; types: string[]; lat: number; lng: number; food: boolean };

async function search(q: string, lat: number, lng: number, radiusM: number): Promise<Hit[]> {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!, "X-Goog-FieldMask": MASK, "content-type": "application/json" },
    body: JSON.stringify({ textQuery: q, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusM } }, regionCode: "GH", languageCode: "en" }),
  });
  if (!r.ok) return [];
  const j = (await r.json()) as { places?: { id: string; displayName?: { text: string }; rating?: number; userRatingCount?: number; businessStatus?: string; primaryType?: string; types?: string[]; location?: { latitude: number; longitude: number }; formattedAddress?: string }[] };
  return (j.places ?? [])
    // Ghana only: Wli and Afadjato sit on the Togo border, Paga on Burkina Faso's.
    .filter((p) => p.businessStatus === "OPERATIONAL" && p.location && !/Togo|Burkina|Ivoire/i.test(p.formattedAddress ?? ""))
    .map((p) => {
      const types = p.types ?? [];
      const all = `${p.primaryType ?? ""} ${types.join(" ")}`;
      return { id: p.id, name: p.displayName?.text ?? "", rating: p.rating ?? 0, count: p.userRatingCount ?? 0, type: p.primaryType ?? "", types, lat: p.location!.latitude, lng: p.location!.longitude, food: FOOD.test(all) && !/lodging|hotel/.test(p.primaryType ?? "") };
    })
    .filter((h) => (h.food || SIGHT.test(`${h.type} ${h.types.join(" ")}`)) && !/lodging|hotel|guest_house|resort_hotel/.test(h.type));
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const venues = await fetchAllRows<{ name: string; lat: number; lng: number; google_place_id: string | null }>((a, b) =>
    db.from("venues").select("name, lat, lng, google_place_id").neq("type", "stay").order("id").range(a, b) as never
  );
  const held = new Set(venues.map((v) => v.google_place_id).filter(Boolean));
  const { data: dests } = await db.from("destinations").select("slug, name, town, lat, lng, radius_km").order("sort");
  let added = 0;
  for (const d of (dests ?? []) as { slug: string; name: string; town: string | null; lat: number; lng: number; radius_km: number }[]) {
    const centre = { lat: Number(d.lat), lng: Number(d.lng) };
    const r = Number(d.radius_km);
    const have = venues.filter((v) => v.lat != null && haversineKm(centre, { lat: +v.lat, lng: +v.lng }) <= r).length;
    const need = TARGET - have;
    if (need <= 0) continue;
    const place = d.town && d.town !== d.name ? d.town : d.name;
    const found = new Map<string, Hit>();
    for (const q of [`restaurants in ${place}`, `cafes and bars in ${place}`, `tourist attractions in ${place}`, `things to do and activities in ${place}`, `parks museums and sights near ${place}`]) {
      for (const h of await search(q, centre.lat, centre.lng, Math.min(50_000, r * 1000))) found.set(h.id, h);
    }
    const small = found.size < 15;
    /*
     * Not twice, and not a non-place: Google lists "Kakum National Park
     * Entrance Gate", "Wli Waterfalls main office" and "Kintampo waterfalls Car
     * Park" beside the sights we already hold, and the town or region itself.
     */
    const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !GENERIC_WORDS.has(w));
    const nearNames = venues.filter((v) => v.lat != null && haversineKm(centre, { lat: +v.lat, lng: +v.lng }) <= r + 5).flatMap((v) => words(v.name ?? ""));
    const taken = new Set<string>(nearNames);
    const placeWords = new Set(words(`${place} ${d.name}`));
    const ok = [...found.values()]
      .filter((h) => !held.has(h.id) && h.rating >= 4 && h.count >= (small ? 5 : 15) && haversineKm(centre, h) <= r)
      // Judged by hand on the dry run of 10 Nov: already held under another name, or the town itself.
      .filter((h) => !["visit wli waterfalls", "mount afadjato", "elimina"].includes(h.name.toLowerCase()))
      .filter((h) => !/car ?park|office|entrance|gate\b|region|district|municipal|catering|trail$/i.test(h.name) && !h.types.some((t) => /locality|political|catering|administrative/.test(t)))
      .filter((h) => {
        const w = words(h.name);
        return w.length > 0 && !w.some((x) => taken.has(x)) && !w.every((x) => placeWords.has(x));
      })
      .sort((a, b) => b.rating * Math.log10(b.count + 1) - a.rating * Math.log10(a.count + 1))
      // One of each: the second "Afadjato Mountain" after "Mount Afadjato".
      .filter((h, i, all) => !all.slice(0, i).some((e) => words(e.name).some((x) => words(h.name).includes(x))));
    const want = Math.min(10, need + 2);
    // Half to eat and drink (trip days can use these at an estimate), half sights and activities (owner: "not just restaurants").
    const food = ok.filter((h) => h.food).slice(0, Math.ceil(want / 2));
    const sights = ok.filter((h) => !h.food).slice(0, want - food.length);
    const pick = [...food, ...sights, ...ok.filter((h) => !food.includes(h) && !sights.includes(h))].slice(0, want);
    console.log(`${d.slug}: has ${have}, needs ${need}; ${ok.length} good on Google; adding ${pick.length}: ${pick.map((h) => `${h.name} (${h.rating}★ ${h.count}${h.food ? ", food" : ""})`).join("; ")}`);
    if (dry) continue;
    for (const h of pick) {
      const res = await venueFromPlace(db, h.id);
      if (!res.ok) {
        console.log(`   ${h.name}: ${res.error}`);
        continue;
      }
      held.add(h.id);
      if (res.venue.created) {
        added++;
        // The number waits for a person, like every number we find (0004).
        const { data: v } = await db.from("venues").select("phone").eq("id", res.venue.id).single();
        if ((v as { phone: string | null } | null)?.phone) await db.from("venues").update({ phone: null, phone_pending: (v as { phone: string }).phone }).eq("id", res.venue.id);
      }
    }
  }
  console.log(`${dry ? "dry run" : `added ${added} places`}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
