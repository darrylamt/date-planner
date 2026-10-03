/**
 * Gaderin activities into Duro! (read with written permission from Gaderin).
 *
 *   npm run gaderin                   read the site, save, and update events
 *   npm run gaderin -- --dry          read and print; nothing is saved
 *   npm run gaderin -- --limit 20     only the first 20 activities (testing)
 *   npm run gaderin -- --full         fetch every page, changed or not
 *   npm run gaderin -- --debug <slug> print one activity as Gaderin holds it
 *
 * Daily on GitHub Actions (.github/workflows/gaderin.yml). Env: the Supabase
 * URL and service role key, from the environment or .env.local.
 *
 * ── what it reads ─────────────────────────────────────────────────────────
 * The sitemap lists every activity; the listing page draws its cards in the
 * browser, so its HTML holds none of them. Each activity's page carries
 * Gaderin's own record in the Next.js data it ships with the page (title,
 * category, price tiers, a date or a weekly pattern, the town, a GhanaPost
 * address, the host, photos), so that is read as JSON rather than guessed at
 * from the page's words. Pages whose sitemap date has not changed are not
 * fetched again for a week: a polite reader, 1.5 s apart, identifying itself.
 *
 * ── what it writes ────────────────────────────────────────────────────────
 * 1. gaderin_activities: Gaderin's activities as they are, with the area and
 *    venue Duro places them at when it can tell.
 * 2. events: the ones placed at a venue, as dated rows the planner reads (it
 *    only plans events at venues, whose location it needs for the travel
 *    between stops). A weekly activity becomes its next two weeks of dates; a
 *    one-off its date. Booked on Gaderin, with the host named as organiser.
 *    Keyed "gaderin:<slug>:<date>", so each run updates them in place and a
 *    date that has gone is taken off.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const BASE = "https://thegaderin.com";
const DELAY_MS = 1500;
const USER_AGENT = "DuroBot/1.0 (Gaderin partner; planbyaduro@gmail.com)";
const REFETCH_DAYS = 7;
const RECUR_DAYS = 14;
const ONE_OFF_DAYS = 60;

/* ── env ── */
const env: Record<string, string> = { ...(process.env as Record<string, string>) };
const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].trim();
  }
}
const SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE;

/* ── types ── */
type Recurrence = { day: string; startTime?: string; endTime?: string };
type GaderinRecord = {
  title?: string;
  slug?: string;
  category?: string;
  description?: string;
  priceTiers?: { name?: string; price?: number }[];
  date?: string;
  time?: string;
  duration?: number;
  location?: string;
  address?: string;
  host?: { name?: string };
  photos?: string[];
  isRecurring?: boolean;
  status?: string;
  recurrenceDays?: Recurrence[];
  [k: string]: unknown;
};
type Activity = {
  slug: string;
  url: string;
  title: string | null;
  description: string | null;
  category: string | null;
  price_ghs: number | null;
  price_tiers: { name: string; price: number }[] | null;
  gaderin_points: number | null;
  location: string | null;
  address: string | null;
  host_name: string | null;
  event_date: string | null;
  start_time: string | null;
  duration_hours: number | null;
  is_recurring: boolean;
  recurrence: Recurrence[] | null;
  image_url: string | null;
  photos: string[] | null;
  area_id: string | null;
  venue_id: string | null;
  sitemap_lastmod: string | null;
  source: "gaderin";
  is_active: boolean;
  scraped_at: string;
};
type Area = { id: string; name: string; city: string | null };
type Venue = { id: string; name: string; area_id: string | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const accraToday = () => new Date().toISOString().slice(0, 10); // Accra is UTC all year

async function fetchText(url: string, retries = 3): Promise<string> {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return await res.text();
      if (res.status === 404) throw new Error(`404 ${url}`);
      console.warn(`HTTP ${res.status} on ${url} (try ${i})`);
    } catch (err) {
      if (i === retries || String(err).includes("404")) throw err;
    }
    await sleep(DELAY_MS * i * 2);
  }
  throw new Error(`Failed: ${url}`);
}

/* ── the sitemap: every activity, and when each last changed ── */
async function sitemap(): Promise<Map<string, string | null>> {
  const xml = await fetchText(`${BASE}/sitemap.xml`);
  const out = new Map<string, string | null>();
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const slug = m[1].match(/\/activities\/([a-z0-9-]+)\s*</i)?.[1]?.toLowerCase();
    if (slug) out.set(slug, m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? null);
  }
  return out;
}

/* ── one page: Gaderin's own record, from the data Next.js ships with it ── */
function flightOf(html: string): string {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1]) as string;
      } catch {
        return "";
      }
    })
    .join("");
}

/** The JSON object starting at `start`, read to its matching brace, or null. */
function objectAt(s: string, start: number): unknown {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(s.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The record whose slug is this one: the nearest enclosing object that parses and says so. */
function recordFor(flight: string, slug: string): GaderinRecord | null {
  const needle = `"slug":"${slug}"`;
  for (let at = flight.indexOf(needle); at !== -1; at = flight.indexOf(needle, at + needle.length)) {
    for (let start = flight.lastIndexOf("{", at); start >= 0 && at - start < 8000; start = flight.lastIndexOf("{", start - 1)) {
      const obj = objectAt(flight, start) as GaderinRecord | null;
      if (obj && obj.slug === slug && (obj.priceTiers || obj.title)) return obj;
    }
  }
  return null;
}

function meta(html: string, key: string): string | null {
  return html.match(new RegExp(`<meta[^>]+property="${key}"[^>]+content="([^"]*)"`))?.[1] ?? null;
}

/* ── placing it in Duro ── */

/**
 * The area, from Gaderin's words for where, else the region in the
 * GhanaPost code. The longest area name found wins, so "East Legon Hills"
 * beats "East Legon" and "East Legon" beats "Legon". Ashanti (A…) is Kumasi,
 * which Duro holds as one area; elsewhere in Greater Accra the area is not
 * known, and an unplaced activity waits in the table for a hand.
 */
function areaFor(rec: GaderinRecord, areas: Area[]): string | null {
  const where = ` ${norm(rec.location)} ${norm(rec.title)} `;
  const hit = areas
    .filter((a) => where.includes(` ${norm(a.name)} `))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (hit) return hit.id;
  if (/^A[A-Z]-/i.test(rec.address ?? "")) return areas.find((a) => norm(a.name) === "kumasi")?.id ?? null;
  return null;
}

/**
 * The venue: the host is the venue ("Glaze Art Studio" hosting at Glaze Art
 * Studio), or the venue is named where it happens or in the title ("Sip and
 * paint at Glaze Art Studio"). Names under six letters are not matched inside
 * other text, so "Osu" is never mistaken for somewhere called Osu.
 */
function venueFor(rec: GaderinRecord, venues: Venue[]): Venue | null {
  const host = norm(rec.host?.name);
  const where = norm(rec.location);
  const title = ` ${norm(rec.title)} `;
  /*
   * The host places it only when the activity does not name somewhere else:
   * Accra Art District hosts a painting session at Lake Club Resort, and
   * putting that at the Art District sends people to the wrong door.
   */
  const hostCounts = !where || /(various|multiple|tbd|tba|to be announced)/.test(where) || where.includes(host);
  return (
    venues.find((v) => norm(v.name) === where || (hostCounts && host && norm(v.name) === host)) ??
    venues.find((v) => norm(v.name).length >= 6 && (title.includes(` ${norm(v.name)} `) || ` ${where} `.includes(` ${norm(v.name)} `))) ??
    null
  );
}

const VIBES: Record<string, string[]> = {
  outdoor: ["outdoorsy", "adventurous"],
  adventure: ["adventurous", "outdoorsy"],
  sports: ["sporty"],
  wellness: ["calm"],
  food: ["foodie"],
  dining: ["foodie"],
  art: ["artsy"],
  arts: ["artsy"],
  creative: ["artsy"],
  culture: ["artsy"],
  music: ["lively"],
  nightlife: ["lively", "dancing"],
  party: ["lively", "dancing"],
};

function toActivity(slug: string, html: string, rec: GaderinRecord, lastmod: string | null, areas: Area[], venues: Venue[]): Activity {
  const tiers = (rec.priceTiers ?? [])
    .filter((t) => typeof t.price === "number" && t.price >= 0)
    .map((t) => ({ name: String(t.name ?? "Ticket"), price: Number(t.price) }));
  const venue = venueFor(rec, venues);
  const points = Number(html.match(/(\d+)\s*GP\b/)?.[1]);
  const photos = (rec.photos ?? []).filter((p) => typeof p === "string");
  return {
    slug,
    url: `${BASE}/activities/${slug}`,
    title: rec.title?.trim() ?? null,
    description: rec.description?.trim() ?? null,
    category: rec.category?.toLowerCase() ?? null,
    price_ghs: tiers.length ? Math.min(...tiers.map((t) => t.price)) : null,
    price_tiers: tiers.length ? tiers : null,
    gaderin_points: Number.isFinite(points) ? points : null,
    location: rec.location?.trim() ?? null,
    address: rec.address?.trim() ?? null,
    host_name: rec.host?.name?.replace(/\s+/g, " ").trim() ?? null,
    event_date: rec.date ? String(rec.date).slice(0, 10) : null,
    start_time: rec.time ?? null,
    duration_hours: typeof rec.duration === "number" ? rec.duration : null,
    is_recurring: Boolean(rec.isRecurring),
    recurrence: rec.recurrenceDays?.length ? rec.recurrenceDays.map(({ day, startTime, endTime }) => ({ day, startTime, endTime })) : null,
    image_url: photos[0] ?? meta(html, "og:image"),
    photos: photos.length ? photos : null,
    // A venue's area is the surer answer; Gaderin's words are the fallback.
    area_id: venue?.area_id ?? areaFor(rec, areas),
    venue_id: venue?.id ?? null,
    sitemap_lastmod: lastmod,
    source: "gaderin",
    // Only what Gaderin itself has on sale: a draft or a withdrawn listing is kept but not used.
    is_active: rec.status == null || rec.status === "published",
    scraped_at: new Date().toISOString(),
  };
}

/* ── events: the dates each placed activity runs ── */
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function datesOf(a: Pick<Activity, "is_recurring" | "recurrence" | "event_date" | "start_time">): { date: string; time: string | null }[] {
  const today = accraToday();
  if (a.is_recurring && a.recurrence?.length) {
    const from = a.event_date && a.event_date > today ? a.event_date : today;
    const out: { date: string; time: string | null }[] = [];
    for (let i = 0; i < RECUR_DAYS; i++) {
      const d = new Date(`${from}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      const slot = a.recurrence.find((r) => r.day?.toLowerCase() === WEEKDAYS[d.getUTCDay()]);
      if (slot) out.push({ date: d.toISOString().slice(0, 10), time: slot.startTime ?? a.start_time });
    }
    return out;
  }
  if (!a.event_date || a.event_date < today) return [];
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + ONE_OFF_DAYS);
  return a.event_date <= horizon.toISOString().slice(0, 10) ? [{ date: a.event_date, time: a.start_time }] : [];
}

function eventsOf(a: Activity, venueArea: Map<string, string | null>) {
  if (!a.venue_id || !a.is_active) return [];
  const area = venueArea.get(a.venue_id) ?? a.area_id;
  if (!area) return [];
  return datesOf(a).map(({ date, time }) => ({
    external_key: `gaderin:${a.slug}:${date}`,
    title: a.title ?? a.slug,
    venue_id: a.venue_id,
    area_id: area,
    event_date: date,
    start_time: time && /^\d{1,2}:\d{2}/.test(time) ? time.slice(0, 5) : null,
    cost_ghs: a.price_ghs,
    category: a.category ?? "other",
    source_url: a.url,
    // Booked where it is sold: Gaderin takes the payment and the place.
    booking_url: a.url,
    description: a.description ? a.description.slice(0, 400) : null,
    image_url: a.image_url,
    organiser_name: a.host_name,
    // Empty, never null: events.vibe_tags is not nullable, and an empty list means "the venue's".
    vibe_tags: VIBES[a.category ?? ""] ?? [],
    is_active: true,
  }));
}

/* ── run ── */
async function fetchAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const full = args.includes("--full");
  const limit = Number(args[args.indexOf("--limit") + 1]) || Infinity;

  if (args[0] === "--debug") {
    const slug = args[1];
    const rec = recordFor(flightOf(await fetchText(`${BASE}/activities/${slug}`)), slug);
    console.log(JSON.stringify(rec, null, 2));
    return;
  }

  if (!dry && (!SUPABASE_URL || !SERVICE_KEY)) throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  const db = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null;

  const [map, areas, venues, known] = await Promise.all([
    sitemap(),
    db ? fetchAll<Area>((f, t) => db.from("areas").select("id,name,city").range(f, t)) : Promise.resolve([] as Area[]),
    db ? fetchAll<Venue>((f, t) => db.from("venues").select("id,name,area_id").eq("is_active", true).range(f, t)) : Promise.resolve([] as Venue[]),
    // Missing before migration 0073 has run: a dry run still works, a real one stops at the save.
    db
      ? fetchAll<{ slug: string; sitemap_lastmod: string | null; scraped_at: string }>((f, t) =>
          db.from("gaderin_activities").select("slug,sitemap_lastmod,scraped_at").range(f, t)
        ).catch((e) => (dry ? [] : Promise.reject(e)))
      : Promise.resolve([]),
  ]);
  const seen = new Map(known.map((k) => [k.slug, k]));
  const fresh = Date.now() - REFETCH_DAYS * 86_400_000;
  const slugs = [...map.keys()].slice(0, limit);
  const due = slugs.filter((s) => {
    const k = seen.get(s);
    return full || dry || !k || k.sitemap_lastmod !== map.get(s) || Date.parse(k.scraped_at) < fresh;
  });
  console.log(`${map.size} in the sitemap; reading ${due.length}, ${slugs.length - due.length} unchanged`);

  const read: Activity[] = [];
  for (const slug of due) {
    await sleep(DELAY_MS);
    try {
      const html = await fetchText(`${BASE}/activities/${slug}`);
      const rec = recordFor(flightOf(html), slug);
      if (!rec) {
        console.warn(`SKIP ${slug}: no record on the page`);
        continue;
      }
      read.push(toActivity(slug, html, rec, map.get(slug) ?? null, areas, venues));
      console.log(`OK   ${slug}`);
    } catch (err) {
      console.warn(`SKIP ${slug}: ${err}`);
    }
  }

  if (dry || !db) {
    console.table(
      read.map((a) => ({
        slug: a.slug.slice(0, 32),
        title: (a.title ?? "").slice(0, 30),
        cat: a.category,
        ghs: a.price_ghs,
        where: a.location,
        host: (a.host_name ?? "").slice(0, 20),
        weekly: a.is_recurring,
        date: a.event_date,
        area: a.area_id ? "yes" : "",
        venue: a.venue_id ? "yes" : "",
      }))
    );
    return;
  }

  // 1. Gaderin, as it is. Anything gone from the sitemap is no longer on sale.
  /*
   * A venue or area is written only when this run found one. A batch upsert
   * sets every column any row in it names, so rows are grouped by which of
   * the two they carry: an activity linked by hand in admin, which the
   * matcher cannot see, keeps its link instead of being reset to nothing.
   */
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const a of read) {
    const row: Record<string, unknown> = { ...a };
    if (!a.venue_id) delete row.venue_id;
    if (!a.area_id) delete row.area_id;
    const key = `${Boolean(a.venue_id)}:${Boolean(a.area_id)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const rows of groups.values()) {
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await db.from("gaderin_activities").upsert(rows.slice(i, i + 100), { onConflict: "slug" });
      if (error) throw new Error(`save activities: ${error.message}`);
    }
  }
  const gone = known.map((k) => k.slug).filter((s) => !map.has(s));
  for (let i = 0; i < gone.length; i += 100) {
    await db.from("gaderin_activities").update({ is_active: false }).in("slug", gone.slice(i, i + 100));
  }

  // 2. Events, from every active activity placed at a venue (this run's and earlier ones').
  // Without the set-aside filter until 0074 has added its column.
  const placed = await fetchAll<Activity>((f, t) =>
    db.from("gaderin_activities").select("*").eq("is_active", true).eq("dismissed", false).not("venue_id", "is", null).range(f, t)
  ).catch(() =>
    fetchAll<Activity>((f, t) => db.from("gaderin_activities").select("*").eq("is_active", true).not("venue_id", "is", null).range(f, t))
  );
  const venueArea = new Map(venues.map((v) => [v.id, v.area_id]));
  const rows = placed.flatMap((a) => eventsOf(a, venueArea));
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db.from("events").upsert(rows.slice(i, i + 100), { onConflict: "external_key" });
    if (error) throw new Error(`save events: ${error.message}`);
  }
  // A future date Gaderin no longer runs comes off; past ones are left as history.
  const keep = new Set(rows.map((r) => r.external_key));
  const ahead = await fetchAll<{ id: string; external_key: string }>((f, t) =>
    db.from("events").select("id,external_key").like("external_key", "gaderin:%").gte("event_date", accraToday()).eq("is_active", true).range(f, t)
  );
  const stale = ahead.filter((e) => !keep.has(e.external_key)).map((e) => e.id);
  for (let i = 0; i < stale.length; i += 100) {
    await db.from("events").update({ is_active: false }).in("id", stale.slice(i, i + 100));
  }

  const unplaced = read.filter((a) => !a.venue_id).length;
  console.log(
    `Saved ${read.length} activities (${gone.length} gone). ${placed.length} placed at venues → ${rows.length} event dates, ${stale.length} withdrawn. ${unplaced} read this run have no venue yet.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
