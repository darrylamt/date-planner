/**
 * Events from ticketing sites into the review queue (0118, owner 26 Nov 2026).
 *
 *   npm run tickets                      read both sites, save new and changed listings
 *   npm run tickets -- --dry             read and print; nothing is saved
 *   npm run tickets -- --source aya      one site only (aya | passa)
 *   npm run tickets -- --limit 10        only the first 10 pages per site (testing)
 *   npm run tickets -- --full            fetch every page, changed or not
 *
 * Daily on GitHub Actions (.github/workflows/tickets.yml).
 *
 * ── what it reads, and why it may ─────────────────────────────────────────
 * Each site's sitemap, then each event page the sitemap lists, for the
 * schema.org Event the page itself publishes for search engines: name,
 * start, place, organiser and (Aya) every ticket tier. Both sites' robots.txt
 * allow these pages (Aya names /en/event/ outright; passa disallows only its
 * API and dashboards, which are never touched), and neither site's terms
 * forbid reading public event pages: Aya's protect its own materials and
 * exclude organiser-provided content; passa's ask buyers not to resell
 * tickets or misuse the platform. Checked 26 Nov 2026.
 *
 * A polite reader: one page every 1.5 s, an honest name, and a page whose
 * sitemap date has not changed is not fetched again.
 *
 * ── what it writes ────────────────────────────────────────────────────────
 * ticket_listings only: the facts and the page's address, with the catalogue
 * venue it looks like. The events team approves each one in Admin -> Event
 * listings, which creates the event, booked on the ticketing site. Posters
 * and descriptions are kept for the reviewer and never published from here.
 * An approved listing that changes (a new date, a new price) updates its
 * event; one that has passed is marked past.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const DELAY_MS = 1500;
const USER_AGENT = "DuroBot/1.0 (+https://www.duroplans.com; planbyaduro@gmail.com)";

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

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FULL = args.includes("--full");
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const ONLY = args.includes("--source") ? args[args.indexOf("--source") + 1] : null;

type Source = "aya" | "passa";
const SOURCES: { id: Source; sitemap: string; page: RegExp }[] = [
  { id: "aya", sitemap: "https://ayatickets.com/sitemap.xml", page: /^https:\/\/ayatickets\.com\/en\/event\/([^/?#]+)$/ },
  { id: "passa", sitemap: "https://passa.live/sitemap.xml", page: /^https:\/\/passa\.live\/drop\/([^/?#]+)$/ },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml" }, signal: AbortSignal.timeout(30_000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Every page address a sitemap (or sitemap index) lists, with its lastmod. */
async function sitemapPages(url: string, depth = 0): Promise<{ loc: string; lastmod: string | null }[]> {
  const xml = await get(url);
  if (!xml) return [];
  const entries = [...xml.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/g)].map((m) => ({
    kind: m[1],
    loc: (m[2].match(/<loc>\s*([^<\s]+)\s*<\/loc>/) ?? [])[1] ?? "",
    lastmod: (m[2].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/) ?? [])[1] ?? null,
  }));
  const out: { loc: string; lastmod: string | null }[] = [];
  for (const e of entries) {
    if (e.kind === "sitemap" && depth < 2) {
      // Only the sitemaps that can hold events: Aya splits its own by kind.
      if (/event|drop|sitemap\.xml$/i.test(e.loc) || !/page|blog|venue|organi[sz]er|help/i.test(e.loc)) out.push(...(await sitemapPages(e.loc, depth + 1)));
    } else if (e.kind === "url" && e.loc) out.push({ loc: e.loc.replace(/&amp;/g, "&"), lastmod: e.lastmod });
  }
  return out;
}

type LdEvent = {
  name?: string;
  startDate?: string;
  endDate?: string;
  eventStatus?: string;
  description?: string;
  image?: string | string[];
  location?: { name?: string; address?: string | { streetAddress?: string; addressLocality?: string; addressCountry?: string }; geo?: { latitude?: number; longitude?: number } };
  organizer?: { name?: string } | { name?: string }[];
  offers?: { price?: number | string; priceCurrency?: string; availability?: string; name?: string } | { price?: number | string; priceCurrency?: string; availability?: string; name?: string }[];
};

/** The page's own schema.org Event, if it publishes one. */
function eventOf(html: string): LdEvent | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      const list = Array.isArray(j) ? j : (j["@graph"] ?? [j]);
      const e = list.find((x: { "@type"?: unknown }) => /Event$/.test(String(x?.["@type"] ?? "")));
      if (e) return e as LdEvent;
    } catch {
      // A broken block is skipped, not fatal.
    }
  }
  return null;
}

/** The cheapest way in for one person: not a VIP, a table or a group ticket, and still on sale if any are. */
function cheapest(offers: LdEvent["offers"]): { price: number | null; soldOut: boolean } {
  const list = (Array.isArray(offers) ? offers : offers ? [offers] : []).filter(
    (o) => (o.priceCurrency ?? "GHS").toUpperCase() === "GHS" && Number.isFinite(Number(o.price)) && !/vip|table|couple|group|bottle|pack|bundle|squad/i.test(o.name ?? "")
  );
  if (!list.length) return { price: null, soldOut: false };
  const open = list.filter((o) => !/SoldOut|Discontinued/i.test(o.availability ?? ""));
  const pick = open.length ? open : list;
  return { price: Math.min(...pick.map((o) => Number(o.price))), soldOut: !open.length };
}

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: venueRows } = await db.from("venues").select("id, name, lat, lng").eq("is_active", true).neq("type", "stay").range(0, 4999);
  const venues = ((venueRows ?? []) as { id: string; name: string; lat: number | null; lng: number | null }[]).map((v) => ({ ...v, key: fold(v.name) }));
  /** The catalogue venue a listing looks like: the name, or failing that the same spot (within 120 m). */
  const suggest = (name: string | null, lat: number | null, lng: number | null): string | null => {
    if (name) {
      const k = fold(name);
      const exact = venues.find((v) => v.key === k);
      if (exact) return exact.id;
      const inside = venues.filter((v) => k.length >= 5 && v.key.length >= 5 && (v.key.includes(k) || k.includes(v.key)));
      if (inside.length === 1) return inside[0].id;
    }
    if (lat != null && lng != null) {
      const near = venues
        .filter((v) => v.lat != null && v.lng != null)
        .map((v) => ({ v, d: km({ lat, lng }, { lat: Number(v.lat), lng: Number(v.lng) }) }))
        .sort((a, b) => a.d - b.d)[0];
      if (near && near.d <= 0.12) return near.v.id;
    }
    return null;
  };

  const { data: known } = await db.from("ticket_listings").select("url, lastmod, status, event_id").range(0, 9999);
  const seen = new Map(((known ?? []) as { url: string; lastmod: string | null; status: string; event_id: string | null }[]).map((r) => [r.url, r]));
  const now = new Date();
  const totals = { pages: 0, fetched: 0, saved: 0, skippedSame: 0, notGhana: 0, past: 0, noData: 0, updatedEvents: 0 };

  for (const src of SOURCES.filter((s) => !ONLY || s.id === ONLY)) {
    const pages = (await sitemapPages(src.sitemap)).filter((p) => src.page.test(p.loc)).slice(0, LIMIT);
    console.log(`${src.id}: ${pages.length} event pages in the sitemap`);
    totals.pages += pages.length;
    for (const p of pages) {
      const before = seen.get(p.loc);
      if (!FULL && before && p.lastmod && before.lastmod === p.lastmod) {
        totals.skippedSame += 1;
        continue;
      }
      await sleep(DELAY_MS);
      const html = await get(p.loc);
      totals.fetched += 1;
      const e = html ? eventOf(html) : null;
      // An organiser's test page ("Test 2") is not an event.
      if (e?.name && /^test/i.test(e.name.trim())) {
        totals.noData += 1;
        continue;
      }
      if (!e?.name || !e.startDate) {
        totals.noData += 1;
        continue;
      }
      const addr = typeof e.location?.address === "object" ? e.location.address : null;
      const country = addr?.addressCountry ?? null;
      if (country && !/^(GH|Ghana)$/i.test(country)) {
        totals.notGhana += 1;
        continue;
      }
      const ends = new Date(e.endDate ?? e.startDate);
      const over = ends.getTime() < now.getTime() - 6 * 3600e3 || /Cancelled/i.test(e.eventStatus ?? "");
      const lat = e.location?.geo?.latitude != null ? Number(e.location.geo.latitude) : null;
      const lng = e.location?.geo?.longitude != null ? Number(e.location.geo.longitude) : null;
      const { price, soldOut } = cheapest(e.offers);
      const organiser = (Array.isArray(e.organizer) ? e.organizer[0] : e.organizer)?.name ?? null;
      const row = {
        source: src.id,
        url: p.loc,
        slug: p.loc.match(src.page)![1],
        title: e.name.trim().slice(0, 200),
        // In UTC, which is Accra's time all year, so the day and the hour read straight off it.
        starts_at: new Date(e.startDate).toISOString(),
        ends_at: e.endDate ? new Date(e.endDate).toISOString() : null,
        place_name: e.location?.name?.trim() || null,
        place_address: addr ? [addr.streetAddress, addr.addressLocality].filter(Boolean).join(", ") || null : typeof e.location?.address === "string" ? e.location.address : null,
        lat,
        lng,
        organiser,
        price_ghs: price,
        sold_out: soldOut,
        image_url: (Array.isArray(e.image) ? e.image[0] : e.image) ?? null,
        description: e.description ? e.description.slice(0, 2000) : null,
        suggested_venue_id: suggest(e.location?.name ?? null, lat, lng),
        lastmod: p.lastmod,
        last_seen_at: now.toISOString(),
        ...(over ? { status: "past" } : {}),
      };
      if (over) totals.past += 1;
      if (DRY) {
        console.log(`  ${over ? "past " : ""}${row.title} | ${row.starts_at} | ${row.place_name ?? "-"} | ${price ?? "no price"}${soldOut ? " (sold out)" : ""} | venue ${row.suggested_venue_id ? "matched" : "-"}`);
        continue;
      }
      // A new listing waits for review; a past one is recorded as past so it is never offered.
      const { error } = await db.from("ticket_listings").upsert(before ? row : { ...row, status: over ? "past" : "new" }, { onConflict: "url" });
      if (error) {
        console.log(`  save failed for ${p.loc}: ${error.message}`);
        continue;
      }
      totals.saved += 1;
      // An approved listing that changed brings its event with it.
      if (before?.status === "approved" && before.event_id && !over) {
        const { error: eErr } = await db
          .from("events")
          .update({ event_date: row.starts_at.slice(0, 10), start_time: row.starts_at.slice(11, 16), ...(price != null ? { cost_ghs: price } : {}) })
          .eq("id", before.event_id);
        if (!eErr) totals.updatedEvents += 1;
      }
    }
  }
  console.log(JSON.stringify(totals));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
