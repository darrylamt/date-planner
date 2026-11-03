/**
 * Tourist sites near the Trips destinations, as venues (owner, 3 Nov 2026:
 * "find tourist sites to add to the venues around those locations").
 *
 *   npx tsx --env-file=.env.local scripts/add-trip-sites.ts scripts/data/trip-sites.json          dry run
 *   npx tsx --env-file=.env.local scripts/add-trip-sites.ts scripts/data/trip-sites.json --apply  write
 *
 * Each site comes from the research file: where it is (OpenStreetMap or
 * Wikipedia), what it is in our own words, and its entry fee only where the
 * operator states one (GMMB for the castles, Wli's own site, two 2026 guides
 * for Aburi). Every other site goes in unpriced: open, findable, and kept
 * out of plans until somebody records a fee, which puts it on the admin's
 * Unpriced venues list. A site already in the catalogue is updated, not
 * added again.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ensureAreaId } from "../src/lib/areas";
import { CITY_CENTRES, nearestNeighbourhood } from "../src/lib/neighbourhoods";
import { haversineKm } from "../src/lib/transport";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const apply = process.argv.includes("--apply");

type Site = {
  dest: string;
  name: string;
  type: "activity" | "outdoor";
  tags: string[];
  price: ["fee", number, string] | ["free"] | null;
  hours: "gmmb" | null;
  desc: string;
  at: { lat: number; lng: number } | null;
};

/** Where buses arrive for each destination, when that town is one of ours; else the nearest of ours. */
const GATEWAY: Record<string, string> = {
  "cape-coast": "Cape Coast", elmina: "Cape Coast", kakum: "Cape Coast", kumasi: "Kumasi", bosomtwe: "Kumasi", ho: "Ho",
  "tafi-atome": "Ho", akosombo: "Akosombo", aburi: "Accra", boti: "Koforidua", busua: "Takoradi", takoradi: "Takoradi",
  nzulezo: "Takoradi", mole: "Tamale", larabanga: "Tamale", bolgatanga: "Bolgatanga", paga: "Bolgatanga", wa: "Wa",
};

/** The village or place an area is named after, where no neighbourhood of ours is close. */
const LOCALITY: Record<string, string> = {
  "Kakum National Park Canopy Walkway": "Kakum", "Elmina Castle": "Elmina", "Fort St Jago": "Elmina", "Bonwire Kente Weaving Centre": "Bonwire",
  "Lake Bosomtwe at Abono": "Abono", "Wli Waterfalls": "Wli", "Mount Afadja": "Liati Wote", "Tagbo Falls": "Liati Wote",
  "Tafi Atome Monkey Sanctuary": "Tafi Atome", "Mount Adaklu": "Adaklu", "Boti Falls": "Boti", "Umbrella Rock": "Boti",
  "Busua Beach": "Busua", "Fort Metal Cross": "Dixcove", "Fort Batenstein": "Butre", "Nzulezo Stilt Village": "Nzulezo",
  "Fort Apollonia": "Beyin", "Mole National Park": "Mole", "Larabanga Mosque": "Larabanga", "Kintampo Waterfalls": "Kintampo Falls",
  "Fuller Falls": "Kintampo Falls", "Paga Crocodile Pond": "Paga", "Pikworo Slave Camp": "Paga", "Sirigu Pottery and Art": "Sirigu",
  "Tongo Hills": "Tongo", "Akosombo Dam": "Akosombo", "Adomi Bridge": "Atimpoku", "Mount Adaklu ": "Adaklu",
};

/** Where Wikipedia places what OpenStreetMap could not find, or found only roughly. */
const FIXED: Record<string, { lat: number; lng: number }> = {
  "Boti Falls": { lat: 6.19295, lng: -0.21875 },
  "Wa Naa's Palace": { lat: 10.0637, lng: -2.5005 },
};
const DROP = new Set(["Mognori Eco-Village", "Wechiau Hippo Sanctuary"]);

/** Already in the catalogue under these names: updated rather than added. */
const EXISTING: Record<string, string> = {
  "Cape Coast Castle": "Cape Coast Castle",
  "Manhyia Palace Museum": "Manhyia Palace Museum",
  "Aburi Botanical Gardens": "Aburi Botanical Gardens & Park",
};

const NOTE: Record<string, string> = {
  "gmmb-cc": "Ghanaian adults GH¢20, non-Ghanaian adults GH¢80, students less (GMMB's Cape Coast Castle page, fees reviewed 1 July 2023; read 3 Nov 2026).",
  "gmmb-el": "Ghanaian adults GH¢20, non-Ghanaian adults GH¢80, students less (GMMB's Elmina Castle page, fees reviewed 1 July 2023; read 3 Nov 2026).",
  wli: "Lower falls: Ghanaians GH¢25, non-Ghanaians GH¢60. Upper falls GH¢60 to 90 (visitwli.com.gh, read 3 Nov 2026).",
  aburi: "Ghanaian adults GH¢20, non-Ghanaian adults GH¢60, cash (two 2026 visitor guides; confirm at the gate).",
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** GMMB: "9:00am to 4:30pm daily". */
const GMMB_HOURS = {
  opening_periods: DAYS.map((_, day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 16, minute: 30 } })),
  opening_hours_text: [1, 2, 3, 4, 5, 6, 0].map((d) => `${DAYS[d]}: 9:00 AM – 4:30 PM`),
};

function cityFor(site: Site, at: { lat: number; lng: number }): string {
  const g = GATEWAY[site.dest];
  if (g) return g;
  return Object.entries(CITY_CENTRES).sort((a, b) => haversineKm(at, a[1]) - haversineKm(at, b[1]))[0][0];
}

async function main() {
  const sites = (JSON.parse(readFileSync(process.argv[2], "utf8")) as Site[]).filter((s) => !DROP.has(s.name));
  const { data: areas } = await db.from("areas").select("id, name, city");
  const areaByName = new Map((areas ?? []).map((a) => [String(a.name).toLowerCase(), a as { id: string; name: string; city: string }]));
  let added = 0, updated = 0, failed = 0;

  for (const s of sites) {
    const at = FIXED[s.name] ?? s.at;
    if (!at) {
      console.log(`skip   ${s.name}: no location`);
      continue;
    }
    const price = s.price;
    const fee = price?.[0] === "fee" ? price[1] : price?.[0] === "free" ? 0 : null;
    const pricing = {
      entry_fee_ghs: fee,
      is_free: price?.[0] === "free",
      charges_note: price?.[0] === "fee" ? NOTE[price[2]] : null,
    };

    if (EXISTING[s.name]) {
      const { data: v } = await db.from("venues").select("id, description, vibe_tags").eq("name", EXISTING[s.name]).maybeSingle();
      if (!v) {
        console.log(`miss   ${s.name}: expected an existing row`);
        failed++;
        continue;
      }
      const patch: Record<string, unknown> = {
        // Open: only a closed place is switched off (owner's rule), and no price is not closed.
        is_active: true,
        // The entry is the whole price: a per-head spend as well would count it twice.
        ...(fee != null ? { ...pricing, avg_cost_per_person_ghs: 0, price_band: "budget" } : {}),
        ...(String(v.description ?? "").trim() ? {} : { description: s.desc }),
        ...((v.vibe_tags as string[] | null)?.length ? {} : { vibe_tags: s.tags }),
      };
      console.log(`update ${s.name}: ${JSON.stringify(patch).slice(0, 140)}`);
      if (apply) {
        const { error } = await db.from("venues").update(patch).eq("id", v.id);
        if (error) (failed++, console.log("  failed:", error.message));
        else updated++;
      }
      continue;
    }

    const city = cityFor(s, at);
    const hood = nearestNeighbourhood(city, at);
    const areaName = hood?.name ?? LOCALITY[s.name] ?? s.name;
    let areaId = areaByName.get(areaName.toLowerCase())?.id ?? null;
    const status = areaId ? `area ${areaName}` : `new area ${areaName} (${city})`;
    console.log(`add    ${s.name} → ${status}${fee != null ? ` · GH¢${fee}` : " · unpriced"}`);
    if (!apply) continue;
    if (!areaId) {
      const made = await ensureAreaId(db as never, areaName, city);
      areaId = made?.id ?? null;
      if (areaId) areaByName.set(areaName.toLowerCase(), { id: areaId, name: areaName, city });
    }
    if (!areaId) {
      console.log("  failed: no area");
      failed++;
      continue;
    }
    const row = {
      name: s.name,
      type: s.type,
      area_id: areaId,
      lat: at.lat,
      lng: at.lng,
      description: s.desc,
      vibe_tags: s.tags,
      best_for: [],
      price_band: "budget",
      avg_cost_per_person_ghs: 0,
      // A recorded entry fee (or free) is a price; nothing recorded is unknown and stays out of plans.
      price_source: fee != null ? "menu" : "unknown",
      ...pricing,
      pricing_mode: "per_person",
      min_party_size: 1,
      reservation_required: false,
      google_maps_url: `https://www.google.com/maps/search/?api=1&query=${at.lat},${at.lng}`,
      is_active: true,
      ...(s.hours === "gmmb" ? GMMB_HOURS : {}),
    };
    const { error } = await db.from("venues").insert(row);
    if (error) (failed++, console.log("  failed:", error.message));
    else added++;
  }
  console.log(apply ? `\n${added} added, ${updated} updated, ${failed} failed` : "\ndry run: nothing written");
}
main();
