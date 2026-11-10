/**
 * Photos for venues from the venue's own website (owner, 10 Nov 2026: "the
 * venue's own and free-licensed"; pictures "should look good").
 *
 *   npx tsx --env-file=.env.local scripts/venue-photos.ts --dry --limit 5   # choose, upload nothing
 *   npx tsx --env-file=.env.local scripts/venue-photos.ts                   # every venue missing pictures
 *   npx tsx --env-file=.env.local scripts/venue-photos.ts --name "Kozo"     # one venue
 *
 * For each active venue with no cover, or fewer than three more pictures:
 *   1. Its own website (scripts/data/places-facts.json, from places-facts.ts),
 *      the home page and up to three of its own gallery/about/rooms pages.
 *      Never a social network, never a stock library (unsplash, pexels...).
 *   2. Candidates must be real photographs at least 900 px wide: no SVG, GIF,
 *      logos, icons, or anything named like one.
 *   3. Gemini looks at them all at once and says, for each, what it shows,
 *      how good a photograph it is, whether text or a logo is laid over it,
 *      and whether it looks like a stock or template picture.
 *   4. The best real photograph of the place (7/10 or better, no overlaid
 *      text) becomes the cover if there is none; up to three more (6/10 or
 *      better, different from each other) fill the gallery.
 *   5. Each is resized to WebP (cover 1600 px wide, others 1280) and put in
 *      the images bucket under venues/, as the admin's own uploads are.
 *
 * Only blanks are filled: a cover somebody chose is never replaced. Every
 * choice is logged to scripts/data/venue-photos-log.json with the page it
 * came from, so any picture can be traced back and taken down.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { fetchAllRows } from "../src/lib/fetchAll";
import { geminiJSON } from "../src/lib/gemini";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
const nameAt = args.indexOf("--name");
const onlyName = nameAt >= 0 ? String(args[nameAt + 1]).toLowerCase() : null;

const UA = "DuroPlansBot/1.0 (+https://www.duroplans.com/support)";
const SOCIAL = /facebook\.com|instagram\.com|linktr\.ee|wa\.me|tiktok\.com|twitter\.com|x\.com|youtube\.com|google\.com|goo\.gl/i;
const STOCK = /unsplash|pexels|shutterstock|istockphoto|gettyimages|freepik|pixabay|depositphotos|stock\.adobe|envato|themeforest|placeholder|placehold|dummy|demo-?content|lorem/i;
const NOT_A_PHOTO = /logo|icon|favicon|sprite|avatar|badge|button|arrow|payment|visa|mastercard|paypal|momo|whatsapp|facebook|instagram|twitter|tiktok|tripadvisor|booking-?com|google-?play|app-?store|qr|map(?!le)|signature|loader|spinner|pattern|texture|bg-|background-?pattern|divider|separator|flag/i;
const LOG = "scripts/data/venue-photos-log.json";

type Venue = { id: string; name: string; type: string; image_url: string | null; gallery_urls: string[] | null; areas: { name: string } | null };
type Candidate = { url: string; page: string; buf: Buffer; width: number; height: number };

/** A page's text and where it ended up, or null; a slow or broken site is skipped, never fatal. */
async function getText(url: string, ms = 12_000): Promise<{ text: string; url: string } | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return { text: await r.text(), url: r.url || url };
  } catch {
    return null;
  }
}

/** A picture's bytes and type, or null. */
async function getImage(url: string, ms = 15_000): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "";
    if (!/image\/(jpe?g|png|webp|avif)/i.test(type)) return null;
    return { buf: Buffer.from(await r.arrayBuffer()), type };
  } catch {
    return null;
  }
}

/** Every picture a page names: social cards, <img> (with srcset and lazy attributes), and CSS backgrounds. */
function imagesIn(html: string, base: string): string[] {
  const out: string[] = [];
  const add = (u: string | undefined) => {
    if (!u) return;
    const clean = u.trim().replace(/&amp;/g, "&");
    if (!clean || clean.startsWith("data:")) return;
    try {
      out.push(new URL(clean, base).href);
    } catch {
      /* not a URL */
    }
  };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = tag.match(/\b(?:data-)?srcset=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      // The widest entry of a srcset.
      const widest = srcset
        .split(",")
        .map((s) => s.trim().split(/\s+/))
        .map(([u, w]) => ({ u, w: Number(String(w ?? "").replace(/\D/g, "")) || 0 }))
        .sort((a, b) => b.w - a.w)[0]?.u;
      add(widest);
    }
    add(tag.match(/\b(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']/i)?.[1]);
  }
  for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(m[1]);
  return out;
}

/** The site's own pages most likely to hold pictures of the place. */
function morePages(html: string, base: string): string[] {
  const host = new URL(base).host;
  const pages = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = `${m[1]} ${m[2].replace(/<[^>]+>/g, " ")}`.toLowerCase();
    if (!/gallery|photos|about|rooms|our-space|the-space|interior|restaurant|dining|lounge|bar|venue|experience/.test(label)) continue;
    try {
      const u = new URL(m[1], base);
      if (u.host === host && !/\.(pdf|jpg|png|webp)$/i.test(u.pathname)) pages.add(u.href.split("?")[0]);
    } catch {
      /* skip */
    }
    if (pages.size >= 3) break;
  }
  return [...pages];
}

async function candidatesFor(site: string): Promise<Candidate[]> {
  const home = await getText(site);
  if (!home) return [];
  const html = home.text;
  const base = home.url;
  const urls = new Map<string, string>();
  for (const u of imagesIn(html, base)) urls.set(u, base);
  for (const page of morePages(html, base)) {
    const r = await getText(page);
    if (r) for (const u of imagesIn(r.text, r.url)) if (!urls.has(u)) urls.set(u, page);
  }
  const picked: Candidate[] = [];
  const seenBytes = new Set<number>();
  for (const [url, page] of urls) {
    if (picked.length >= 10) break;
    const path = (() => {
      try {
        return decodeURIComponent(new URL(url).pathname).toLowerCase();
      } catch {
        return url.toLowerCase();
      }
    })();
    if (STOCK.test(url) || NOT_A_PHOTO.test(path) || /\.(svg|gif|ico)(\?|$)/i.test(path) || SOCIAL.test(new URL(url).host)) continue;
    const got = await getImage(url);
    if (!got) continue;
    const buf = got.buf;
    if (buf.length < 40_000 || buf.length > 15_000_000 || seenBytes.has(buf.length)) continue;
    try {
      const meta = await sharp(buf).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w < 900 || h < 500 || w / h > 2.6 || w / h < 0.55) continue;
      seenBytes.add(buf.length);
      picked.push({ url, page, buf, width: w, height: h });
    } catch {
      /* not an image sharp can read */
    }
  }
  return picked;
}

type Verdict = { index: number; shows: string; quality: number; overlay_text: boolean; stock_like: boolean; same_as: number | null };

async function judge(v: Venue, cands: Candidate[]): Promise<Verdict[] | null> {
  const parts = await Promise.all(
    cands.map(async (c) => ({ inline: { mime: "image/jpeg", data: await sharp(c.buf).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer() } }))
  );
  const res = await geminiJSON<{ photos: Verdict[] }>({
    parts,
    prompt: `These ${cands.length} pictures (numbered 0 to ${cands.length - 1}, in order) come from the website of "${v.name}", a ${v.type} in ${v.areas?.name ?? "Ghana"}, Ghana. We want photographs to show on its listing in a going-out app.

For each picture say:
- shows: one of "interior", "exterior", "food", "drink", "rooms", "pool", "view", "activity", "people", "logo", "flyer", "menu", "map", "other".
- quality: 1 to 10, as a photograph for the listing: sharp, well lit, well framed, appealing. A blurry, dark, tiny-looking, heavily filtered or collage picture is 4 or less.
- overlay_text: true if words, prices, a logo or a watermark are laid over the picture.
- stock_like: true if it looks like a generic stock or website-template picture rather than this actual place (e.g. models posed in a studio, a picture that could be anywhere, or that does not fit a venue in Ghana).
- same_as: the index of an earlier picture this is a near-duplicate of, else null.
Return every index once.`,
    schema: {
      type: "object",
      properties: {
        photos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "integer" },
              shows: { type: "string" },
              quality: { type: "integer" },
              overlay_text: { type: "boolean" },
              stock_like: { type: "boolean" },
              same_as: { type: "integer", nullable: true },
            },
            required: ["index", "shows", "quality", "overlay_text", "stock_like", "same_as"],
          },
        },
      },
      required: ["photos"],
    },
    timeoutMs: 90_000,
  });
  if (!res.ok) {
    console.log(`    gemini: ${res.message}`);
    if (res.reason === "limit") throw new Error("limit");
    return null;
  }
  return res.data.photos;
}

const GOOD = new Set(["interior", "exterior", "food", "drink", "rooms", "pool", "view", "activity"]);

async function upload(db: ReturnType<typeof createClient>, buf: Buffer, width: number): Promise<string> {
  const webp = await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const path = `venues/${randomUUID()}.webp`;
  const { error } = await db.storage.from("images").upload(path, webp, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(error.message);
  return db.storage.from("images").getPublicUrl(path).data.publicUrl;
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const facts: Record<string, { website: string | null }> = JSON.parse(readFileSync("scripts/data/places-facts.json", "utf8"));
  const log: Record<string, unknown> = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : {};
  const venues = (
    await fetchAllRows<Venue>((a, b) => db.from("venues").select("id, name, type, image_url, gallery_urls, booking_url, areas(name)").eq("is_active", true).order("id").range(a, b) as never)
  )
    // A stay's booking link is its own website (stay-rates.ts saves it there).
    .map((v) => {
      const own = (v as Venue & { booking_url: string | null }).booking_url;
      if (!facts[v.id]?.website && v.type === "stay" && own) facts[v.id] = { website: own };
      return v;
    })
    .filter(
    (v) =>
      (!v.image_url || (v.gallery_urls?.length ?? 0) < 3) &&
      facts[v.id]?.website &&
      !SOCIAL.test(facts[v.id].website!) &&
      !log[v.id] &&
      (!onlyName || v.name.toLowerCase().includes(onlyName))
  );
  console.log(`${venues.length} venues to look at${dry ? " (dry run)" : ""}`);

  let covers = 0, extras = 0, nothing = 0, done = 0, stopped = false;
  // Four venues at a time: most of the wait is other people's slow websites.
  const queue = venues.slice(0, Number.isFinite(limit) ? limit : venues.length);
  const worker = async () => {
    while (queue.length && !stopped) {
      const v = queue.shift()!;
      done++;
      await one(v);
    }
  };
  const one = async (v: Venue) => {
    const site = facts[v.id].website!;
    const cands = await candidatesFor(site);
    if (!cands.length) {
      nothing++;
      log[v.id] = { name: v.name, site, result: "no usable pictures" };
      return;
    }
    let verdicts: Verdict[] | null;
    try {
      verdicts = await judge(v, cands);
    } catch {
      if (!stopped) console.log("Gemini's free limit is used up; stopping. Re-run tomorrow to carry on.");
      stopped = true;
      return;
    }
    if (!verdicts) return;
    const usable = verdicts
      .filter((x) => cands[x.index] && GOOD.has(x.shows) && !x.overlay_text && !x.stock_like && x.same_as == null)
      .sort((a, b) => b.quality - a.quality);
    // A cover is shown cropped to the app's frame: a banner wider than 1.9:1 or a tall picture loses too much.
    const fitsCover = (x: Verdict) => {
      const c = cands[x.index];
      const r = c.width / c.height;
      return x.quality >= 7 && r >= 0.95 && r <= 1.9;
    };
    const cover = !v.image_url ? usable.find((x) => fitsCover(x) && x.shows !== "food" && x.shows !== "drink") ?? usable.find(fitsCover) : undefined;
    const room = 3 - (v.gallery_urls?.length ?? 0);
    const more = usable.filter((x) => x !== cover && x.quality >= 6).slice(0, Math.max(0, room));
    if (!cover && !more.length) {
      nothing++;
      log[v.id] = { name: v.name, site, result: "nothing good enough", verdicts };
      console.log(`  ${v.name}: nothing good enough (${cands.length} looked at)`);
      return;
    }
    console.log(`  ${v.name}: ${cover ? `cover ${cover.shows} ${cover.quality}/10` : "keeps its cover"}${more.length ? `, +${more.length} more` : ""}`);
    if (dry) {
      // Small copies of what it would choose, to look at before anything is uploaded.
      const peek = process.env.PHOTO_PEEK_DIR;
      if (peek) {
        const slug = v.name.replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
        if (cover) await sharp(cands[cover.index].buf).resize({ width: 640 }).jpeg({ quality: 70 }).toFile(`${peek}/${slug}-cover.jpg`);
        for (const [i, m] of more.entries()) await sharp(cands[m.index].buf).resize({ width: 480 }).jpeg({ quality: 65 }).toFile(`${peek}/${slug}-${i + 1}.jpg`);
      }
      return;
    }
    try {
      const coverUrl = cover ? await upload(db, cands[cover.index].buf, 1600) : null;
      const moreUrls: string[] = [];
      for (const m of more) moreUrls.push(await upload(db, cands[m.index].buf, 1280));
      const patch: Record<string, unknown> = {};
      if (coverUrl) patch.image_url = coverUrl;
      if (moreUrls.length) patch.gallery_urls = [...(v.gallery_urls ?? []), ...moreUrls];
      let q = db.from("venues").update(patch).eq("id", v.id);
      if (coverUrl) q = q.is("image_url", null);
      const { error } = await q;
      if (error) throw new Error(error.message);
      if (coverUrl) covers++;
      extras += moreUrls.length;
      log[v.id] = {
        name: v.name,
        site,
        result: "added",
        cover: cover ? { from: cands[cover.index].url, page: cands[cover.index].page, stored: coverUrl } : null,
        more: more.map((m, i) => ({ from: cands[m.index].url, page: cands[m.index].page, stored: moreUrls[i] })),
      };
    } catch (e) {
      console.log(`    upload failed: ${(e as Error).message}`);
    }
    if (!dry) writeFileSync(LOG, JSON.stringify(log, null, 1));
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (!dry) writeFileSync(LOG, JSON.stringify(log, null, 1));
  console.log(`${dry ? "would add" : "added"}: ${covers} covers, ${extras} more pictures; ${nothing} with nothing usable`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
