/**
 * Take down pictures that look AI-generated (owner, 10 Nov 2026: "try not to
 * use AI generated images... I can tell, very easily").
 *
 *   npx tsx --env-file=.env.local scripts/ai-photo-check.ts --dry   # report only
 *   npx tsx --env-file=.env.local scripts/ai-photo-check.ts         # remove what is flagged
 *
 * Checks every picture the fill scripts added (scripts/data/venue-photos-log.json
 * and the Wikimedia covers, which carry image_credit), two ways:
 *   1. The original file's own labels: C2PA / IPTC "trainedAlgorithmicMedia",
 *      or a generator's name (Firefly, DALL-E, Midjourney, Stable Diffusion,
 *      Imagen, Ideogram) in its metadata.
 *   2. Gemini, looking for the tells: waxy or plastic surfaces, garbled
 *      lettering, impossible hands or furniture, too-perfect lighting.
 * Either flags it. A flagged cover is cleared (the venue shows no picture
 * rather than a fake one); a flagged extra leaves the gallery.
 * Neither check is certain, so the owner still has the last word.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { geminiJSON } from "../src/lib/gemini";

const dry = process.argv.includes("--dry");
const UA = "DuroPlansBot/1.0 (+https://www.duroplans.com/support)";
const MARKERS = /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|c2pa|Adobe Firefly|DALL[·-]?E|Midjourney|Stable ?Diffusion|Imagen|Ideogram|Leonardo\.ai|GPT-?4o image|made with AI/i;

type Pic = { venue: string; name: string; stored: string; from: string | null; role: "cover" | "more" };

async function bytes(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const pics: Pic[] = [];
  const LOG = "scripts/data/venue-photos-log.json";
  const log: Record<string, { name: string; result: string; cover?: { from: string; stored: string } | null; more?: { from: string; stored: string }[] }> = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : {};
  for (const [venue, e] of Object.entries(log)) {
    if (e.result !== "added") continue;
    if (e.cover?.stored) pics.push({ venue, name: e.name, stored: e.cover.stored, from: e.cover.from, role: "cover" });
    for (const m of e.more ?? []) if (m.stored) pics.push({ venue, name: e.name, stored: m.stored, from: m.from, role: "more" });
  }
  const { data: credited } = await db.from("venues").select("id, name, image_url").not("image_credit", "is", null);
  for (const v of (credited ?? []) as { id: string; name: string; image_url: string }[]) pics.push({ venue: v.id, name: v.name, stored: v.image_url, from: null, role: "cover" });
  console.log(`${pics.length} pictures to check`);

  const flagged: (Pic & { why: string })[] = [];
  for (let i = 0; i < pics.length; i += 6) {
    const batch = pics.slice(i, i + 6);
    const got = await Promise.all(batch.map(async (p) => ({ p, stored: await bytes(p.stored), original: p.from ? await bytes(p.from) : null })));
    for (const g of got) {
      const meta = g.original?.toString("latin1") ?? "";
      if (MARKERS.test(meta)) flagged.push({ ...g.p, why: `file label: ${meta.match(MARKERS)![0]}` });
    }
    const ok = got.filter((g) => g.stored && !flagged.some((f) => f.stored === g.p.stored));
    if (!ok.length) continue;
    const parts = await Promise.all(ok.map(async (g) => ({ inline: { mime: "image/jpeg", data: await sharp(g.stored!).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer() } })));
    const res = await geminiJSON<{ photos: { index: number; ai_generated: boolean; confidence: number; tells: string }[] }>({
      parts,
      prompt: `These ${ok.length} pictures (0 to ${ok.length - 1}) are on the listings of real venues in Ghana. Say for each whether it looks AI-generated or a 3D render rather than a real photograph. Tells: waxy or plastic skin and food, garbled or nonsense lettering on signs and menus, warped hands, cutlery or furniture, impossible reflections, everything perfectly lit and symmetrical, a dreamlike gloss. A real but heavily edited or professional photo is NOT AI-generated. confidence 0-100. tells: a few words, or "".`,
      schema: {
        type: "object",
        properties: {
          photos: {
            type: "array",
            items: { type: "object", properties: { index: { type: "integer" }, ai_generated: { type: "boolean" }, confidence: { type: "integer" }, tells: { type: "string" } }, required: ["index", "ai_generated", "confidence", "tells"] },
          },
        },
        required: ["photos"],
      },
      timeoutMs: 90_000,
    });
    if (!res.ok) {
      console.log(`  gemini: ${res.message}`);
      if (res.reason === "limit") break;
      continue;
    }
    for (const r of res.data.photos) if (ok[r.index] && r.ai_generated && r.confidence >= 60) flagged.push({ ...ok[r.index].p, why: `looks generated (${r.confidence}%): ${r.tells}` });
  }

  for (const f of flagged) console.log(`  ${f.name} [${f.role}]: ${f.why}`);
  console.log(`${flagged.length} flagged of ${pics.length}`);
  writeFileSync("scripts/data/ai-photo-check.json", JSON.stringify(flagged, null, 1));
  if (dry) return;
  for (const f of flagged) {
    const { data: v } = await db.from("venues").select("image_url, gallery_urls, image_credit").eq("id", f.venue).single();
    if (!v) continue;
    const patch: Record<string, unknown> = {};
    if (v.image_url === f.stored) Object.assign(patch, { image_url: null, image_credit: null, image_source: null });
    if ((v.gallery_urls ?? []).includes(f.stored)) patch.gallery_urls = (v.gallery_urls as string[]).filter((u) => u !== f.stored);
    if (Object.keys(patch).length) await db.from("venues").update(patch).eq("id", f.venue);
    const path = f.stored.split("/object/public/images/")[1];
    if (path) await db.storage.from("images").remove([path]);
  }
  console.log("removed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
