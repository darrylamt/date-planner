/**
 * Places to stay with real rates, for every Trips destination (owner, 10 Nov
 * 2026: fill Trips "for the whole of Ghana", data from 2026, over 90%).
 *
 *   npx tsx --env-file=.env.local scripts/stay-rates.ts --dry                # read and print, save nothing
 *   npx tsx --env-file=.env.local scripts/stay-rates.ts --dest cape-coast    # one destination
 *   npx tsx --env-file=.env.local scripts/stay-rates.ts                      # every destination without a priced stay
 *
 * For each destination:
 *   1. Google's places to stay around it (findLodging, as the admin's stay
 *      finder), open, inside the destination's own radius first.
 *   2. The best-reviewed ones with a website of their own: the home page and
 *      its rooms/rates/accommodation pages, and a rates PDF if one is linked.
 *   3. Gemini reads them for nightly room rates the hotel itself prints.
 *      NEVER a guess: no printed price, no room. A page that dates its rates
 *      to an earlier year than 2026 is not used.
 *   4. A stay with at least one rate is saved as the import does (venue of
 *      type stay, stay_details, its rooms), with the page the rates came from
 *      and today's date beside them.
 *
 * Rates in cedis only. A hotel that prints only dollars is listed in the
 * output for a person to decide; converting would make a figure the hotel
 * never published.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { findLodging, isClosed, matchArea } from "../src/lib/places";
import { areaCentroids } from "../src/lib/areaCentroids";
import { ensureAreaId } from "../src/lib/areas";
import { CITY_CENTRES } from "../src/lib/neighbourhoods";
import { haversineKm } from "../src/lib/transport";
import { regionFromAddress, stayKindFromTypes } from "../src/lib/stays";
import { geminiJSON } from "../src/lib/gemini";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const destAt = args.indexOf("--dest");
const onlyDest = destAt >= 0 ? args[destAt + 1] : null;
const TODAY = new Date().toISOString().slice(0, 10);
const UA = "DuroPlansBot/1.0 (+https://www.duroplans.com/support)";
const NOT_OWN_SITE = /facebook\.com|instagram\.com|linktr\.ee|wa\.me|booking\.com|airbnb\.|tripadvisor\.|expedia\.|hotels\.com|agoda\.|trivago\.|google\.|goo\.gl/i;
const LOG = "scripts/data/stay-rates-log.json";
const ROOM_TYPES = ["single", "double", "twin", "triple", "family", "suite", "dorm", "apartment", "chalet", "tent", "other"];

type Dest = { slug: string; name: string; region: string; town: string | null; lat: number; lng: number; radius_km: number };

async function getText(url: string): Promise<{ html: string; url: string } | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!r.ok || !/html/i.test(r.headers.get("content-type") ?? "html")) return null;
    return { html: await r.text(), url: r.url || url };
  } catch {
    return null;
  }
}
async function getPdf(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!r.ok || !/pdf/i.test(r.headers.get("content-type") ?? "")) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length < 6_000_000 ? b : null;
  } catch {
    return null;
  }
}
const textOf = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|p|div|li|tr|h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8373;|&#x20b5;/gi, "₵")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

/** The hotel's own pages most likely to carry rates, and any rates PDF. */
async function pagesFor(site: string): Promise<{ text: string; pages: string[]; pdf: { url: string; data: Buffer } | null }> {
  const home = await getText(site);
  if (!home) return { text: "", pages: [], pdf: null };
  const host = new URL(home.url).host;
  const links = new Set<string>();
  let pdfUrl: string | null = null;
  for (const m of home.html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = `${m[1]} ${m[2].replace(/<[^>]+>/g, " ")}`.toLowerCase();
    if (!/room|rate|tariff|accommodation|suite|chalet|price|book|stay|lodg/.test(label)) continue;
    try {
      const u = new URL(m[1], home.url);
      if (/\.pdf$/i.test(u.pathname)) {
        if (!pdfUrl && /rate|tariff|price/.test(label)) pdfUrl = u.href;
        continue;
      }
      if (u.host === host) links.add(u.href.split("#")[0]);
    } catch {
      /* skip */
    }
  }
  const pages = [home.url, ...[...links].slice(0, 4)];
  let text = `PAGE ${home.url}\n${textOf(home.html).slice(0, 6000)}`;
  for (const p of pages.slice(1)) {
    const r = await getText(p);
    if (r) text += `\n\nPAGE ${r.url}\n${textOf(r.html).slice(0, 6000)}`;
  }
  const pdfData = pdfUrl ? await getPdf(pdfUrl) : null;
  return { text: text.slice(0, 24_000), pages, pdf: pdfData ? { url: pdfUrl!, data: pdfData } : null };
}

type Room = { name: string; room_type: string; sleeps: number | null; price: number; currency: string; per: string; breakfast_included: boolean | null; weekend: boolean; quote: string; page: string };
type Read = { is_this_hotel: boolean; dated_year: number | null; rooms: Room[] };

async function readRates(name: string, town: string, text: string, pdf: Buffer | null): Promise<Read | null> {
  const res = await geminiJSON<Read>({
    parts: [...(pdf ? [{ inline: { mime: "application/pdf", data: pdf } }] : []), { text }],
    prompt: `Above is text from the website of "${name}", a place to stay in or near ${town}, Ghana${pdf ? ", and a rates PDF linked from it" : ""}. Each page starts with "PAGE <url>".

Find the nightly room rates THIS place prints for itself.
- Only prices actually printed for a room or unit. NEVER estimate, average, or carry a price from one room to another. No printed price, no room.
- currency: "GHS" for GH¢, GHC, GH₵, cedis; "USD", "EUR", or "other".
- per: "night" for a room per night; "person" if per person per night; "other" for anything else (per hour, per stay, packages, day rooms, conference halls).
- weekend: true if the price is labelled as a weekend rate.
- breakfast_included: true or false only if the page says; else null.
- sleeps: only if stated (e.g. "2 adults", "family room for 4"); else null.
- room_type: one of ${ROOM_TYPES.join(", ")}.
- quote: the few words around the price, copied exactly.
- page: the PAGE url it was on (or "pdf").
- is_this_hotel: false if the site is clearly not this place (a different hotel, a booking site, a template, a domain for sale).
- dated_year: if the rates are labelled with a year ("2025 rates", "valid until Dec 2024"), that year; else null.`,
    schema: {
      type: "object",
      properties: {
        is_this_hotel: { type: "boolean" },
        dated_year: { type: "integer", nullable: true },
        rooms: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              room_type: { type: "string" },
              sleeps: { type: "integer", nullable: true },
              price: { type: "number" },
              currency: { type: "string" },
              per: { type: "string" },
              breakfast_included: { type: "boolean", nullable: true },
              weekend: { type: "boolean" },
              quote: { type: "string" },
              page: { type: "string" },
            },
            required: ["name", "room_type", "sleeps", "price", "currency", "per", "breakfast_included", "weekend", "quote", "page"],
          },
        },
      },
      required: ["is_this_hotel", "dated_year", "rooms"],
    },
    timeoutMs: 90_000,
  });
  if (!res.ok) {
    console.log(`      gemini: ${res.message}`);
    if (res.reason === "limit") throw new Error("limit");
    return null;
  }
  return res.data;
}

/** A printed price must appear in the text Gemini was given: the check that stops a misread or an invention. */
function printed(text: string, price: number): boolean {
  const n = Math.round(price);
  const forms = [String(n), n.toLocaleString("en-US"), `${n}.00`];
  return forms.some((f) => new RegExp(`(^|[^0-9])${f.replace(/[.,]/g, "\\$&")}([^0-9]|$)`).test(text));
}

async function saveStay(db: SupabaseClient, d: Dest, p: Awaited<ReturnType<typeof findLodging>>[number], rooms: Room[], source: string, centroids: Awaited<ReturnType<typeof areaCentroids>>) {
  const at = { lat: p.lat!, lng: p.lng! };
  const town = p.localities[0] ?? d.town ?? d.name;
  let areaId = matchArea(p.addressParts, centroids, at).existingId;
  const nearest = Object.entries(CITY_CENTRES).sort((a, b) => haversineKm(at, a[1]) - haversineKm(at, b[1]))[0][0];
  if (!areaId) areaId = (await ensureAreaId(db, town, nearest))?.id ?? null;
  if (!areaId) throw new Error("no area");
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
      // The number waits behind 0004's gate like any found number.
      phone_pending: p.phone,
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
  if (error || !row) throw new Error(error?.message ?? "not saved");
  const id = (row as { id: string }).id;
  await db.from("stay_details").insert({
    venue_id: id,
    kind: stayKindFromTypes(p.types),
    region: regionFromAddress(p.addressParts) ?? d.region,
    town,
    address: p.address || null,
    rates_checked_on: TODAY,
    notes: `Rates as printed on ${source}, read ${TODAY}.`,
  });
  // A site often lists a room twice (a card and a booking table): once each.
  const seen = new Set<string>();
  const weekday = rooms.filter((r) => {
    const k = `${r.name.trim().toLowerCase()}|${r.price}`;
    if (r.weekend || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const { error: roomError } = await db.from("stay_rooms").insert(
    weekday.map((r, i) => ({
      venue_id: id,
      name: r.name.slice(0, 80),
      room_type: ROOM_TYPES.includes(r.room_type) ? r.room_type : "other",
      sleeps: r.sleeps && r.sleeps >= 1 && r.sleeps <= 30 ? r.sleeps : r.room_type === "single" ? 1 : r.room_type === "family" ? 4 : 2,
      price_per_night_ghs: Math.round(r.price * 100) / 100,
      weekend_price_ghs: rooms.find((w) => w.weekend && w.name === r.name)?.price ?? null,
      breakfast_included: r.breakfast_included === true,
      notes: `"${r.quote.slice(0, 200)}" (${r.page === "pdf" ? "rates PDF" : r.page}, ${TODAY})`.slice(0, 500),
      sort: i,
    }))
  );
  if (roomError) throw new Error(`rooms: ${roomError.message}`);
  return id;
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const log: Record<string, unknown> = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : {};
  const { data: dests } = await db.from("destinations").select("slug, name, region, town, lat, lng, radius_km").order("sort");
  const { data: held } = await db.from("venues").select("id, google_place_id, lat, lng, stay_rooms(price_per_night_ghs, is_active)").eq("type", "stay");
  const stays = (held ?? []) as { id: string; google_place_id: string | null; lat: number; lng: number; stay_rooms: { price_per_night_ghs: number | null; is_active: boolean }[] }[];
  const centroids = await areaCentroids(db);
  const dollarsOnly: string[] = [];

  for (const d of (dests ?? []) as Dest[]) {
    if (onlyDest && d.slug !== onlyDest) continue;
    const centre = { lat: Number(d.lat), lng: Number(d.lng) };
    const pricedHere = stays.filter((s) => s.lat && haversineKm(centre, { lat: +s.lat, lng: +s.lng }) <= Number(d.radius_km) && s.stay_rooms.some((r) => r.is_active && r.price_per_night_ghs != null));
    if (pricedHere.length >= 2) continue;
    const reach = Math.max(8, Number(d.radius_km) * 1.5);
    let found;
    try {
      found = await findLodging(centre, reach, d.town && d.town !== d.name ? `${d.name}, ${d.town}` : d.name);
    } catch (e) {
      console.log(`${d.slug}: Google did not answer (${(e as Error).message})`);
      continue;
    }
    const inside = found
      .filter((p) => p.lat != null && !isClosed(p.businessStatus) && p.website && !NOT_OWN_SITE.test(p.website))
      .map((p) => ({ p, km: haversineKm(centre, { lat: p.lat!, lng: p.lng! }) }))
      .filter((x) => x.km <= reach && !stays.some((s) => s.google_place_id === x.p.id))
      // Inside the destination's own radius first (that is what makes it ready), then by how many people reviewed it.
      .sort((a, b) => Number(b.km <= Number(d.radius_km)) - Number(a.km <= Number(d.radius_km)) || (b.p.ratingCount ?? 0) - (a.p.ratingCount ?? 0))
      .slice(0, 6);
    console.log(`${d.slug}: ${found.length} places to stay, ${inside.length} with a website of their own to read`);
    let saved = pricedHere.length;
    for (const { p, km } of inside) {
      if (saved >= 2) break;
      const { text, pages, pdf } = await pagesFor(p.website!);
      if (text.length < 200 && !pdf) {
        console.log(`   ${p.name} (${km.toFixed(1)} km): site did not answer`);
        continue;
      }
      let read: Read | null;
      try {
        read = await readRates(p.name, d.town ?? d.name, text, pdf?.data ?? null);
      } catch {
        console.log("Gemini's free limit is used up; stopping.");
        writeFileSync(LOG, JSON.stringify(log, null, 1));
        return;
      }
      if (!read || !read.is_this_hotel) {
        console.log(`   ${p.name}: not this place's own site`);
        continue;
      }
      if (read.dated_year != null && read.dated_year < 2026) {
        console.log(`   ${p.name}: its rates are dated ${read.dated_year}, not used`);
        continue;
      }
      const nightly = read.rooms.filter((r) => r.per === "night" && r.price > 0);
      const cedis = nightly.filter((r) => r.currency === "GHS" && r.price >= 80 && r.price <= 30000 && (r.page === "pdf" || printed(text, r.price)));
      if (!cedis.length) {
        if (nightly.some((r) => r.currency === "USD")) dollarsOnly.push(`${p.name} (${d.slug}): ${nightly.filter((r) => r.currency === "USD").map((r) => `${r.name} $${r.price}`).join(", ")} on ${p.website}`);
        console.log(`   ${p.name}: no rates in cedis on its site`);
        continue;
      }
      const source = pdf && cedis.some((r) => r.page === "pdf") ? pdf.url : cedis[0].page || pages[0];
      console.log(`   ${p.name} (${km.toFixed(1)} km, ${p.rating ?? "?"}★ ${p.ratingCount ?? 0}): ${cedis.map((r) => `${r.name} GH¢${r.price}${r.weekend ? " (weekend)" : ""}`).join("; ")}`);
      log[p.id] = { destination: d.slug, name: p.name, website: p.website, source, rooms: cedis, read: TODAY };
      if (!dry) {
        try {
          await saveStay(db, d, p, cedis, source, centroids);
          saved++;
        } catch (e) {
          console.log(`      not saved: ${(e as Error).message}`);
        }
      } else saved++;
    }
  }
  if (!dry) writeFileSync(LOG, JSON.stringify(log, null, 1));
  if (dollarsOnly.length) console.log(`\nDollar rates only, for a person to decide:\n  ${dollarsOnly.join("\n  ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
