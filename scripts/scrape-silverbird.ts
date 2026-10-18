/**
 * Silverbird's Ghana showtimes into cinema_showtimes (migration 0086).
 *
 *   npm run silverbird           read both Ghana cinemas and save
 *   npm run silverbird -- --dry  read and print; nothing is saved
 *
 * Daily on GitHub Actions (.github/workflows/silverbird.yml). Env: the
 * Supabase URL and service role key, from the environment or .env.local.
 *
 * ── not shown to anyone yet ───────────────────────────────────────────────
 * Silverbird's terms reserve their content, so nothing in the app or the
 * planner reads this table until they have said yes. This collects and keeps
 * it current so it is ready, and so the parser has met every format first.
 *
 * ── what it reads ─────────────────────────────────────────────────────────
 * Each cinema's page (/cinema/accra/, /cinema/westhills/) lists the week's
 * films as server-drawn cards: poster, title, running time, showtimes by day
 * group ("FRI-SUN: 1:10PM, 9:10PM", "MON-THUR: 6:40PM"), release date,
 * genres, language, rating. The page also says which week it is ("Movies
 * Showing from 16th – 22nd October, 2026"), and the day groups are expanded
 * onto that week's dates. A film marked COMING SOON has no showings. Two
 * pages, 1.5 s apart, identifying itself.
 *
 * ── what it writes ────────────────────────────────────────────────────────
 * A row per showing from today to the end of the listed week, keyed
 * "silverbird:<cinema>:<film>:<date>:<time>", so a run updates in place.
 * Showings still ahead that the site no longer lists are switched off, but
 * only when the page parsed, so a site outage never wipes the week.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const BASE = "https://silverbirdcinemas.com";
const USER_AGENT = "DuroBot/1.0 (listings for Duro!; planbyaduro@gmail.com)";
const DELAY_MS = 1500;
/** Ghana's cinemas, and how to recognise each in our catalogue. */
const CINEMAS = [
  { slug: "accra", venue: /silverbird.*accra mall/i },
  { slug: "westhills", venue: /silverbird.*west ?hills/i },
];
/** The site's own shelves, not genres. */
const NOT_GENRES = new Set(["now showing", "slider", "coming soon"]);

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
const DRY = process.argv.includes("--dry");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const accraToday = () => new Date().toISOString().slice(0, 10); // Accra is UTC all year

/* ── reading ── */
export type Film = {
  slug: string;
  title: string;
  url: string;
  runtimeMins: number | null;
  groups: { days: number[]; times: string[] }[];
  releaseDate: string | null;
  genres: string[];
  language: string | null;
  rating: number | null;
  poster: string | null;
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DAY_INDEX: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, TUES: 2, WED: 3, THU: 4, THUR: 4, THURS: 4, FRI: 5, SAT: 6 };

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…");
}
const text = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** "16th – 22nd October, 2026" and "30th October – 5th November, 2026" to the dates it covers. */
export function weekOf(html: string): { from: string; to: string } | null {
  const m = text(html).match(
    /Movies Showing from (\d{1,2})(?:st|nd|rd|th)?\s*([A-Za-z]+)?\s*[–-]\s*(\d{1,2})(?:st|nd|rd|th)?\s*([A-Za-z]+),?\s*(\d{4})/i
  );
  if (!m) return null;
  const endMonth = MONTHS.indexOf(m[4].toLowerCase());
  const startMonth = m[2] ? MONTHS.indexOf(m[2].toLowerCase()) : endMonth;
  if (endMonth < 0 || startMonth < 0) return null;
  const year = Number(m[5]);
  const iso = (y: number, mo: number, d: number) => `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { from: iso(startMonth > endMonth ? year - 1 : year, startMonth, Number(m[1])), to: iso(year, endMonth, Number(m[3])) };
}

/** "FRI-SUN" to [5, 6, 0]; "WED-THUR" to [3, 4]; "DAILY" to every day. */
export function daysOf(label: string): number[] {
  const l = label.trim().replace(/:$/, "").trim().toUpperCase();
  if (/DAILY|EVERY ?DAY|ALL WEEK/.test(l)) return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();
  for (const part of l.split(/[,&]|\bAND\b/)) {
    const [a, b] = part.split(/\s*[-–]\s*/).map((x) => DAY_INDEX[x.trim()]);
    if (a === undefined) continue;
    if (b === undefined) out.add(a);
    else for (let d = a; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === b) break;
    }
  }
  return [...out];
}

/** "9:10PM" to "21:10"; null for anything else. */
export function clock(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})[:.](\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function filmsOf(html: string): Film[] {
  const films: Film[] = [];
  for (const card of html.split(/<article class="entry-item">/).slice(1)) {
    const link = card.match(/<h4 class="entry-title"><a href="(https:\/\/silverbirdcinemas\.com\/movie\/([a-z0-9-]+)\/?)">([\s\S]*?)<\/a>/);
    if (!link) continue;
    const runtime = text(card.match(/<div class="entry-date">([\s\S]*?)<\/div>/)?.[1] ?? "").match(/(?:(\d+)\s*hours?)?\s*(?:(\d+)\s*min)/i);
    const show = card.match(/<p class="cinema_page_showtime">([\s\S]*?)<\/p>/)?.[1] ?? "";
    const groups = [...show.matchAll(/<span><strong>([^<]*)<\/strong><\/span>\s*<strong>([^<]*)<\/strong>/g)]
      .map(([, label, times]) => ({
        days: daysOf(decode(label)),
        times: decode(times).split(",").map(clock).filter((t): t is string => Boolean(t)),
      }))
      .filter((g) => g.days.length && g.times.length);
    const release = text(card.match(/<span>Release:<\/span>([\s\S]*?)<\/div>/)?.[1] ?? "");
    const releaseDate = release && !Number.isNaN(Date.parse(`${release} 12:00 UTC`)) ? new Date(`${release} 12:00 UTC`).toISOString().slice(0, 10) : null;
    const genreHtml = card.match(/<span>Genre:<\/span>([\s\S]*?)<\/div>/)?.[1] ?? "";
    const genres = [...genreHtml.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map(([, g]) => decode(g).trim()).filter((g) => !NOT_GENRES.has(g.toLowerCase()));
    const language = text(card.match(/<span>Language:<\/span>([\s\S]*?)<\/div>/)?.[1] ?? "") || null;
    const rating = Number(card.match(/<span class="rate">([\d.]+)<\/span>/)?.[1]);
    // The card's thumbnail with its size suffix taken off is the full poster.
    const thumb = card.match(/<img[^>]+src="(https:\/\/silverbirdcinemas\.com\/wp-content\/uploads\/[^"]+)"/)?.[1] ?? null;
    films.push({
      slug: link[2],
      title: text(link[3]),
      url: link[1],
      runtimeMins: runtime ? Number(runtime[1] ?? 0) * 60 + Number(runtime[2] ?? 0) || null : null,
      groups,
      releaseDate,
      genres: [...new Set(genres)],
      language,
      rating: Number.isFinite(rating) ? rating : null,
      poster: thumb ? thumb.replace(/-\d+x\d+(\.\w+)$/, "$1") : null,
    });
  }
  return films;
}

/** Every showing of a film inside the listed week, from today on. */
export function showingsOf(film: Film, week: { from: string; to: string }, today: string): { date: string; time: string }[] {
  const out: { date: string; time: string }[] = [];
  for (let d = new Date(`${week.from}T12:00:00Z`); d.toISOString().slice(0, 10) <= week.to; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    if (date < today) continue;
    const times = new Set(film.groups.filter((g) => g.days.includes(d.getUTCDay())).flatMap((g) => g.times));
    for (const time of [...times].sort()) out.push({ date, time });
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return await res.text();
      console.warn(`HTTP ${res.status} on ${url} (try ${i})`);
    } catch (e) {
      console.warn(`${(e as Error).message} on ${url} (try ${i})`);
    }
    await sleep(DELAY_MS * i * 2);
  }
  throw new Error(`could not read ${url}`);
}

/* ── run ── */
async function main() {
  if (!DRY && (!SUPABASE_URL || !SERVICE_KEY)) throw new Error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const db = DRY ? null : createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const today = accraToday();

  const venues = db
    ? ((await db.from("venues").select("id,name").ilike("name", "%silverbird%")).data ?? [])
    : [];

  for (const [n, cinema] of CINEMAS.entries()) {
    if (n) await sleep(DELAY_MS);
    const url = `${BASE}/cinema/${cinema.slug}/`;
    const html = await fetchText(url);
    const name = text(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? cinema.slug).replace(/\s*-\s*Silverbird Cinemas$/i, "");
    const week = weekOf(html);
    const films = filmsOf(html);
    const venueId = venues.find((v) => cinema.venue.test(v.name))?.id ?? null;
    console.log(`\n${name}: ${films.length} films, week ${week ? `${week.from} to ${week.to}` : "not found"}, venue ${venueId ?? "not in catalogue"}`);
    if (!week || !films.length) {
      console.warn("  page not understood; nothing saved or switched off for this cinema");
      continue;
    }

    const rows = films.flatMap((f) =>
      showingsOf(f, week, today).map(({ date, time }) => ({
        external_key: `silverbird:${cinema.slug}:${f.slug}:${date}:${time}`,
        chain: "silverbird",
        cinema: cinema.slug,
        cinema_name: name.slice(0, 120),
        venue_id: venueId,
        film_slug: f.slug,
        title: f.title.slice(0, 200),
        runtime_mins: f.runtimeMins,
        genres: f.genres,
        language: f.language,
        rating: f.rating,
        release_date: f.releaseDate,
        film_url: f.url,
        poster_url: f.poster,
        show_date: date,
        show_time: time,
        is_active: true,
        scraped_at: new Date().toISOString(),
      }))
    );
    for (const f of films) {
      const n = showingsOf(f, week, today).length;
      console.log(`  ${f.title} (${f.runtimeMins ?? "?"} min; ${f.genres.join(", ") || "no genre"}): ${n ? `${n} showings` : "no showings ahead"}`);
    }
    if (!db) continue;

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("cinema_showtimes").upsert(rows.slice(i, i + 200), { onConflict: "external_key" });
      if (error) throw new Error(`save: ${error.message}`);
    }
    const keep = new Set(rows.map((r) => r.external_key));
    const { data: ahead, error } = await db
      .from("cinema_showtimes")
      .select("id,external_key")
      .eq("cinema", cinema.slug)
      .eq("is_active", true)
      .gte("show_date", today);
    if (error) throw new Error(`read back: ${error.message}`);
    const stale = (ahead ?? []).filter((r) => !keep.has(r.external_key)).map((r) => r.id);
    for (let i = 0; i < stale.length; i += 100) {
      await db.from("cinema_showtimes").update({ is_active: false }).in("id", stale.slice(i, i + 100));
    }
    console.log(`  saved ${rows.length} showings, switched off ${stale.length}`);
  }
}

if (process.argv[1]?.includes("scrape-silverbird")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
