/**
 * Menus from a venue's own website (owner, 10 Nov 2026: fill the catalogue to
 * over 90%, with 2026 data).
 *
 *   npx tsx --env-file=.env.local scripts/venue-menus.ts --dry --limit 5   # read, save nothing
 *   npx tsx --env-file=.env.local scripts/venue-menus.ts                   # every venue with no menu
 *   npx tsx --env-file=.env.local scripts/venue-menus.ts --name "Kozo"
 *
 * For each active venue with no menu of its own (or shared), no entry fee,
 * and a website of its own (scripts/data/places-facts.json):
 *   1. The site's menu: pages, PDFs or pictures its links call a menu (or a
 *      price list, for places that sell activities).
 *   2. readMenu (menuReader.ts), the same reader as the admin's photo import
 *      and with the owner's rules: never a guessed price, every item priced
 *      as printed, delivery-app lists refused.
 *   3. Saved as the venue's menu with the photo import's field mapping, only
 *      if it reads as a real menu (five priced items or more) of this venue.
 *
 * 2026 only: a menu file named for an earlier year, or one its server says
 * was last changed before 2025, is skipped. A menu page on the live site is
 * taken as the menu now, and the log records where each came from.
 * Afterwards run `npm run menu:understand` so the new dishes get their roles.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fetchAllRows } from "../src/lib/fetchAll";
import { readMenu, type MenuPart, type ReadItem } from "../src/lib/menuReader";
import { parseClock, parseDays } from "../src/lib/menuTiming";
import { compact } from "../src/lib/fold";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
const nameAt = args.indexOf("--name");
const onlyName = nameAt >= 0 ? String(args[nameAt + 1]).toLowerCase() : null;
const UA = "DuroPlansBot/1.0 (+https://www.duroplans.com/support)";
const SOCIAL = /facebook\.com|instagram\.com|linktr\.ee|wa\.me|tiktok\.com|twitter\.com|x\.com|youtube\.com|google\.com/i;
const DELIVERY = /bolt\.eu|glovo|jumia|ubereats|chowdeck|food\.bolt/i;
const OLD_YEAR = /(?:^|[^0-9])(20(?:0\d|1\d|2[0-5]))(?:[^0-9]|$)/;
const LOG = "scripts/data/venue-menus-log.json";

type Venue = { id: string; name: string; type: string; menu_shared_from: string | null; entry_fee_ghs: number | null; is_free: boolean };

async function fetchOk(url: string, ms = 15_000): Promise<Response | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(ms) });
    return r.ok ? r : null;
  } catch {
    return null;
  }
}
async function body(r: Response): Promise<Buffer | null> {
  try {
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}
const textOf = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|p|div|li|tr|h\d|td)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8373;|&#x20b5;/gi, "₵")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

/** Too old to be a 2026 menu: a year before 2026 in its name, or last changed before 2025. */
function stale(url: string, r: Response): boolean {
  if (OLD_YEAR.test(decodeURIComponent(new URL(url).pathname))) return true;
  const lm = r.headers.get("last-modified");
  return Boolean(lm && Date.parse(lm) < Date.parse("2025-01-01"));
}

/** What the site offers as its menu, ready for readMenu. */
async function menuParts(site: string): Promise<{ parts: MenuPart[]; sources: string[] }> {
  const home = await fetchOk(site);
  if (!home) return { parts: [], sources: [] };
  const homeHtml = (await body(home))?.toString("utf8") ?? "";
  const base = home.url || site;
  const host = new URL(base).host;
  const cands: string[] = [];
  for (const m of homeHtml.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = `${m[1]} ${m[2].replace(/<[^>]+>/g, " ")}`.toLowerCase();
    if (!/menu|food|drinks|price ?list|rates|our-dishes|a-la-carte/.test(label)) continue;
    try {
      const u = new URL(m[1], base);
      if (DELIVERY.test(u.host) || SOCIAL.test(u.host)) continue;
      if (u.host === host || /\.(pdf|jpe?g|png|webp)$/i.test(u.pathname)) cands.push(u.href);
    } catch {
      /* skip */
    }
  }
  const parts: MenuPart[] = [];
  const sources: string[] = [];
  for (const url of [...new Set(cands)].slice(0, 4)) {
    if (parts.length >= 8) break;
    const r = await fetchOk(url, 25_000);
    if (!r || stale(url, r)) continue;
    const type = (r.headers.get("content-type") ?? "").split(";")[0];
    const data = await body(r);
    if (!data) continue;
    if (type === "application/pdf" && data.length < 8_000_000) {
      parts.push({ mime: "application/pdf", data });
      sources.push(url);
    } else if (/^image\/(jpeg|png|webp)$/.test(type) && data.length > 30_000 && data.length < 8_000_000) {
      parts.push({ mime: type, data });
      sources.push(url);
    } else if (type === "text/html") {
      const html = data.toString("utf8");
      const text = textOf(html);
      // A page that prices things: at least a handful of numbers that look like prices.
      if ((text.match(/(?:GH[S¢₵C]?|₵|¢)\s?\d{2,5}|\d{2,5}(?:\.00)?\s?(?:GH[S¢₵C]|cedis)/gi) ?? []).length >= 5) {
        parts.push({ text: text.slice(0, 30_000), name: url });
        sources.push(url);
      }
      // Menu pictures on the page itself.
      for (const im of html.matchAll(/<img\b[^>]*\b(?:data-src|src)=["']([^"']+)["'][^>]*>/gi)) {
        if (parts.length >= 8) break;
        if (!/menu/i.test(im[1])) continue;
        try {
          const iu = new URL(im[1], r.url || url).href;
          const ir = await fetchOk(iu);
          if (!ir || stale(iu, ir)) continue;
          const it = (ir.headers.get("content-type") ?? "").split(";")[0];
          const idata = await body(ir);
          if (idata && /^image\/(jpeg|png|webp)$/.test(it) && idata.length > 30_000) {
            parts.push({ mime: it, data: idata });
            sources.push(iu);
          }
        } catch {
          /* skip */
        }
      }
    }
  }
  return { parts, sources };
}

function fieldsOf(r: ReadItem): Record<string, unknown> {
  return {
    name: r.name.trim().slice(0, 160),
    price_ghs: r.price_ghs,
    category: r.category,
    notes: r.notes?.trim() || null,
    is_alcoholic: r.category === "drink" ? (r.alcoholic === "yes" ? true : r.alcoholic === "no" ? false : null) : false,
    covers_people: r.covers_people && r.covers_people > 1 ? r.covers_people : 1,
    ...(r.dietary?.trim() ? { dietary_note: r.dietary.trim().slice(0, 80) } : {}),
    ...(r.days?.trim() && parseDays(r.days) ? { available_days: parseDays(r.days) } : {}),
    ...(r.from?.trim() && parseClock(r.from) != null ? { available_from_minute: parseClock(r.from) } : {}),
    ...(r.to?.trim() && parseClock(r.to) != null ? { available_to_minute: parseClock(r.to) } : {}),
  };
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const facts: Record<string, { website: string | null }> = JSON.parse(readFileSync("scripts/data/places-facts.json", "utf8"));
  const log: Record<string, unknown> = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : {};
  const withMenu = new Set(
    (await fetchAllRows<{ venue_id: string }>((a, b) => db.from("menu_items").select("venue_id").order("id").range(a, b) as never)).map((r) => r.venue_id)
  );
  const venues = (
    await fetchAllRows<Venue>((a, b) =>
      db.from("venues").select("id, name, type, menu_shared_from, entry_fee_ghs, is_free").eq("is_active", true).neq("type", "stay").order("id").range(a, b) as never
    )
  ).filter(
    (v) =>
      !withMenu.has(v.id) &&
      !(v.menu_shared_from && withMenu.has(v.menu_shared_from)) &&
      v.entry_fee_ghs == null &&
      !v.is_free &&
      facts[v.id]?.website &&
      !SOCIAL.test(facts[v.id].website!) &&
      !DELIVERY.test(facts[v.id].website!) &&
      !log[v.id] &&
      (!onlyName || v.name.toLowerCase().includes(onlyName))
  );
  console.log(`${venues.length} venues without a menu that have a website${dry ? " (dry run)" : ""}`);

  let saved = 0, items = 0, done = 0;
  for (const v of venues) {
    if (done >= limit) break;
    done++;
    const site = facts[v.id].website!;
    const { parts, sources } = await menuParts(site);
    if (!parts.length) {
      log[v.id] = { name: v.name, site, result: "no menu on the site" };
      continue;
    }
    const res = await readMenu(parts);
    if (!res.ok) {
      console.log(`  ${v.name}: ${res.message}`);
      if (res.reason === "limit") break;
      continue;
    }
    const printedName = compact(res.venueName ?? "");
    const ours = compact(v.name);
    const sameVenue = !printedName || printedName.includes(ours.slice(0, 6)) || ours.includes(printedName.slice(0, 6));
    const good = res.items.filter((i) => i.price_ghs > 0 && i.price_ghs < 50_000 && !i.unsure);
    if (res.deliveryApp || !sameVenue || good.length < 5) {
      log[v.id] = { name: v.name, site, sources, result: res.deliveryApp ? "a delivery app's list" : !sameVenue ? `menu printed for "${res.venueName}"` : `only ${good.length} priced items` };
      console.log(`  ${v.name}: not used (${(log[v.id] as { result: string }).result})`);
      continue;
    }
    console.log(`  ${v.name}: ${good.length} items from ${sources.length} source(s), e.g. ${good.slice(0, 3).map((i) => `${i.name} GH¢${i.price_ghs}`).join("; ")}`);
    if (dry) continue;
    const { error } = await db.from("menu_items").insert(good.map((i) => ({ ...fieldsOf(i), venue_id: v.id })));
    if (error) {
      console.log(`    not saved: ${error.message}`);
      continue;
    }
    await db.from("venues").update({ price_source: "menu" }).eq("id", v.id).eq("price_source", "unknown");
    saved++;
    items += good.length;
    log[v.id] = { name: v.name, site, sources, result: "added", items: good.length, read: new Date().toISOString().slice(0, 10) };
    writeFileSync(LOG, JSON.stringify(log, null, 1));
  }
  if (!dry) writeFileSync(LOG, JSON.stringify(log, null, 1));
  console.log(`${dry ? "would add" : "added"} menus for ${saved} venues (${items} items)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
