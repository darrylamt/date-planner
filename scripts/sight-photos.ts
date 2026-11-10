/**
 * Cover photos for sights from Wikimedia Commons, with their credit (owner,
 * 10 Nov 2026: venue photos from the venue itself or free-licensed only).
 * Forts, falls, parks, museums and markets have no website to take a
 * picture from, and they are what a trip's days are made of.
 *
 *   npx tsx --env-file=.env.local scripts/sight-photos.ts --dry    # choose, save nothing
 *   npx tsx --env-file=.env.local scripts/sight-photos.ts          # save (needs 0105 for the credit)
 *
 * For each active venue with no cover that is a sight:
 *   1. The lead photo of its English Wikipedia article, when there is one
 *      about this place in Ghana (an editor chose it to stand for the place),
 *      then a Commons search for the name and "Ghana".
 *   2. Only licences that allow reuse with credit: CC0, public domain, CC BY,
 *      CC BY-SA. The author and licence are kept as the credit line.
 *   3. Gemini checks each candidate shows this place and is a good photograph.
 *   4. The best is resized to WebP and stored like the admin's uploads, with
 *      image_credit and image_source (0105). Before 0105 has run nothing is
 *      saved: a CC BY photo shown without its credit breaks its licence.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { fetchAllRows } from "../src/lib/fetchAll";
import { geminiJSON } from "../src/lib/gemini";

const dry = process.argv.includes("--dry");
const UA = "DuroPlansBot/1.0 (+https://www.duroplans.com/support)";
const SIGHT = /castle|fort|falls|waterfall|park|museum|mosque|palace|lake|mount|hills?\b|bridge|dam|beach|village|sanctuary|pond|market|monument|mausoleum|memorial|cathedral|shrine|rock|gardens?|reserve|camp|stadium|square|arch|lighthouse|cave|craft|weaving/i;
const OK_LICENCE = /^(cc0|public domain|pd|cc by(-sa)? \d(\.\d)?|cc by(-sa)?)/i;

type Venue = { id: string; name: string; type: string; areas: { name: string; city: string } | null };
type Cand = { title: string; url: string; page: string; width: number; height: number; credit: string; licence: string };

async function json<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** imageinfo for Commons files: a 1600px rendering, size, author and licence. */
async function info(titles: string[]): Promise<Cand[]> {
  if (!titles.length) return [];
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1600",
    titles: titles.join("|"),
  });
  const r = await json<{ query?: { pages?: Record<string, { title: string; imageinfo?: { thumburl?: string; descriptionurl: string; width: number; height: number; mime: string; extmetadata?: Record<string, { value: string }> }[] }> } }>(
    `https://commons.wikimedia.org/w/api.php?${q}`
  );
  const out: Cand[] = [];
  for (const p of Object.values(r?.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/image\/(jpeg|png)/.test(ii.mime) || ii.width < 1200) continue;
    if (/map|logo|flag|coat of arms|diagram|plan|stamp|banknote|coin|svg/i.test(p.title)) continue;
    const md = ii.extmetadata ?? {};
    const licence = strip(md.LicenseShortName?.value ?? "");
    if (!OK_LICENCE.test(licence)) continue;
    const author = strip(md.Artist?.value ?? "") || "unknown";
    out.push({
      title: p.title,
      url: ii.thumburl ?? "",
      page: ii.descriptionurl,
      width: ii.width,
      height: ii.height,
      licence,
      credit: `Photo: ${author.slice(0, 120)}, ${licence}, Wikimedia Commons`.slice(0, 300),
    });
  }
  return out.filter((c) => c.url);
}

/*
 * The words of a name that pick out this place rather than any place of its
 * kind. "South Village" matched a photo of a trotro station in Kpeve, and
 * "Wa Naa's Palace" a photo of someone's palace pillars: a candidate's file
 * title must carry one of these, or it is not used.
 */
const GENERIC = new Set(
  "the and of at in on by ghana accra kumasi beach village park garden gardens resort hotel restaurant lounge club bar centre center market museum fort castle falls waterfall waterfalls lake mount mountain hills hill palace mosque pond sanctuary national regional craft crafts weaving lodge water reserve forest monkey crocodile camp slave tour tours cultural culture art arts kente old new great little".split(" ")
);
const distinctive = (name: string) =>
  name
    .toLowerCase()
    .replace(/'s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !GENERIC.has(w));
const carries = (title: string, words: string[]) => {
  const t = title.toLowerCase();
  return words.length > 0 && words.some((w) => t.includes(w.slice(0, Math.max(4, w.length - 1))));
};

async function candidatesFor(v: Venue): Promise<Cand[]> {
  const name = v.name.replace(/\(.*?\)/g, "").trim();
  const words = distinctive(name);
  if (!words.length) return [];
  const titles: string[] = [];
  // Wikipedia's lead photo for an article about this place.
  const wp = await json<{ query?: { search?: { title: string }[] } }>(
    `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", list: "search", srsearch: `${name} Ghana`, srlimit: "3" })}`
  );
  for (const hit of wp?.query?.search ?? []) {
    if (!carries(hit.title, words)) continue;
    const pi = await json<{ query?: { pages?: Record<string, { pageimage?: string }> } }>(
      `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", prop: "pageimages", piprop: "name", titles: hit.title })}`
    );
    for (const p of Object.values(pi?.query?.pages ?? {})) if (p.pageimage) titles.push(`File:${p.pageimage}`);
    break;
  }
  // Commons search.
  const cs = await json<{ query?: { search?: { title: string }[] } }>(
    `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", list: "search", srnamespace: "6", srsearch: `${name} Ghana`, srlimit: "8" })}`
  );
  for (const hit of cs?.query?.search ?? []) if (!titles.includes(hit.title) && carries(hit.title, words)) titles.push(hit.title);
  return (await info(titles.slice(0, 9))).slice(0, 6);
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const probe = await db.from("venues").select("image_credit").limit(1);
  const canCredit = !probe.error;
  if (!canCredit && !dry) {
    console.log("Run migration 0105 first: a free-licensed photo has to carry its credit. Dry run instead:");
  }
  const venues = (
    await fetchAllRows<Venue & { image_url: string | null }>((a, b) =>
      db.from("venues").select("id, name, type, image_url, areas(name, city)").eq("is_active", true).neq("type", "stay").is("image_url", null).order("id").range(a, b) as never
    )
  ).filter((v) => v.type === "outdoor" || SIGHT.test(v.name));
  console.log(`${venues.length} sights without a cover`);
  let saved = 0, none = 0;
  for (const v of venues) {
    const cands = await candidatesFor(v);
    if (!cands.length) {
      none++;
      console.log(`  ${v.name}: nothing free to use`);
      continue;
    }
    const bufs: Buffer[] = [];
    for (const c of cands) {
      try {
        const r = await fetch(c.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
        bufs.push(r.ok ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0));
      } catch {
        bufs.push(Buffer.alloc(0));
      }
    }
    const ok = cands.map((c, i) => ({ c, b: bufs[i] })).filter((x) => x.b.length > 20_000);
    if (!ok.length) continue;
    const parts = await Promise.all(ok.map(async (x) => ({ inline: { mime: "image/jpeg", data: await sharp(x.b).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer() } })));
    const res = await geminiJSON<{ photos: { index: number; is_place: boolean; quality: number; overlay_text: boolean }[] }>({
      parts,
      prompt: `These ${ok.length} photos (0 to ${ok.length - 1}) are candidates for the cover of "${v.name}", ${v.type === "outdoor" ? "an outdoor sight" : "a sight"} in ${v.areas?.name ?? "Ghana"}, Ghana, in a going-out and travel app.
For each: is_place (true only if it plainly shows ${v.name} itself, not a different place, a person's portrait, a document or an object in close-up), quality 1-10 as an inviting cover photograph (sharp, well lit, well framed; old scans, dark or tilted shots 4 or less), overlay_text (words or watermark on the picture). Return every index once.`,
      schema: {
        type: "object",
        properties: {
          photos: {
            type: "array",
            items: { type: "object", properties: { index: { type: "integer" }, is_place: { type: "boolean" }, quality: { type: "integer" }, overlay_text: { type: "boolean" } }, required: ["index", "is_place", "quality", "overlay_text"] },
          },
        },
        required: ["photos"],
      },
      timeoutMs: 90_000,
    });
    if (!res.ok) {
      console.log(`  ${v.name}: ${res.message}`);
      if (res.reason === "limit") break;
      continue;
    }
    const best = res.data.photos
      .filter((p) => ok[p.index] && p.is_place && !p.overlay_text && p.quality >= 7)
      .filter((p) => {
        const r = ok[p.index].c.width / ok[p.index].c.height;
        return r >= 0.95 && r <= 1.9;
      })
      .sort((a, b) => b.quality - a.quality)[0];
    if (!best) {
      none++;
      console.log(`  ${v.name}: none good enough`);
      continue;
    }
    const pick = ok[best.index];
    console.log(`  ${v.name}: ${pick.c.title} (${best.quality}/10) ${pick.c.credit}`);
    if (dry || !canCredit) continue;
    const webp = await sharp(pick.b).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const path = `venues/${randomUUID()}.webp`;
    const up = await db.storage.from("images").upload(path, webp, { contentType: "image/webp", upsert: false });
    if (up.error) {
      console.log(`    upload failed: ${up.error.message}`);
      continue;
    }
    const url = db.storage.from("images").getPublicUrl(path).data.publicUrl;
    const { error } = await db.from("venues").update({ image_url: url, image_credit: pick.c.credit, image_source: pick.c.page }).eq("id", v.id).is("image_url", null);
    if (error) console.log(`    not saved: ${error.message}`);
    else saved++;
  }
  console.log(`${dry || !canCredit ? "would save" : "saved"} ${saved} covers; ${none} with nothing usable`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
