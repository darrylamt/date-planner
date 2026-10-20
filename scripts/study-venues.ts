/**
 * Gemini studies every venue: photos, menu, listing, into venue_insights (0088).
 *
 *   npm run study-venues                 venues new or changed since their last study
 *   npm run study-venues -- --all        every active venue, changed or not
 *   npm run study-venues -- --limit 10   only the first 10 (testing)
 *   npm run study-venues -- --dry        read and print; nothing is saved
 *   npm run study-venues -- --venue "Kozo"   just the venues whose name contains it
 *
 * Env: Supabase URL, service role key, GEMINI_API_KEY (.env.local or the
 * environment). Weekly on GitHub Actions (.github/workflows/study-venues.yml).
 *
 * What it learns, per venue, from what we hold and nothing else:
 *   noise          quiet / conversational / buzzy / loud: can a table hear itself
 *   occasion_fit   0-10 for each occasion
 *   signature      the menu items the place is known for, named as on our menu
 *   features       rooftop, air-conditioned, live music, good for groups...
 *   confidence     how much there was to go on
 * The planner weighs these in insights.ts. A venue's photos are public and
 * so is its menu, so the free tier is fine here (gemini.ts).
 *
 * Paced for the free tier: Flash Lite allows 15 a minute and 500 a day, which
 * covers the catalogue; the other models take over when it is busy.
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.existsSync(path.join(process.cwd(), ".env.local"))
  ? fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)
  : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ALL = process.argv.includes("--all");
const DRY = process.argv.includes("--dry");
const LIMIT = Number(arg("--limit")) || Infinity;
const ONLY = arg("--venue")?.toLowerCase();
const PACE_MS = 4500;

const OCCASIONS = [
  "first_date", "date_night", "anniversary", "birthday", "friend_outing", "solo_day",
  "family_day", "business_meeting", "graduation", "celebration",
];
const FEATURES = [
  "air_conditioned", "outdoor_seating", "rooftop", "sea_view", "live_music", "good_for_groups",
  "kid_friendly", "instagrammable", "parking", "private_room",
];

const SCHEMA = {
  type: "OBJECT",
  properties: {
    noise: { type: "STRING", enum: ["quiet", "conversational", "buzzy", "loud", "unknown"] },
    occasion_fit: { type: "OBJECT", properties: Object.fromEntries(OCCASIONS.map((o) => [o, { type: "INTEGER" }])) },
    signature_dishes: { type: "ARRAY", items: { type: "STRING" } },
    features: { type: "ARRAY", items: { type: "STRING", enum: FEATURES } },
    basis: { type: "STRING" },
  },
  required: ["noise", "occasion_fit", "signature_dishes", "features", "basis"],
};

type Row = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  vibe_tags: string[] | null;
  best_for: string[] | null;
  cuisines: string[] | null;
  dress_code: string | null;
  image_url: string | null;
  gallery_urls: string[] | null;
  menu_shared_from: string | null;
  areas: { name: string } | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { geminiJSON, ownImage, GEMINI_LIGHT_MODELS, GEMINI_MODELS } = await import("../src/lib/gemini");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE!, {
    auth: { persistSession: false },
  });
  // Flash Lite first for the whole catalogue, then the full Flash models, then Gemma.
  const models = [...new Set([...GEMINI_LIGHT_MODELS.slice(0, 2), ...GEMINI_MODELS])];

  const { data: venues, error } = await db
    .from("venues")
    .select("id,name,type,description,vibe_tags,best_for,cuisines,dress_code,image_url,gallery_urls,menu_shared_from,areas(name)")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  const { data: done } = await db.from("venue_insights").select("venue_id,inputs_hash");
  const seen = new Map(((done ?? []) as { venue_id: string; inputs_hash: string | null }[]).map((d) => [d.venue_id, d.inputs_hash]));

  let studied = 0;
  let skipped = 0;
  for (const v of (venues ?? []) as unknown as Row[]) {
    if (ONLY && !v.name.toLowerCase().includes(ONLY)) continue;
    if (studied >= LIMIT) break;

    const { data: menuRows } = await db
      .from("menu_items")
      .select("name,category,price_ghs,notes")
      .in("venue_id", [...new Set([v.id, v.menu_shared_from ?? v.id])])
      .limit(300);
    const menu = ((menuRows ?? []) as { name: string; category: string; price_ghs: number; notes: string | null }[]).filter(
      (m) => Number(m.price_ghs) > 0
    );
    const photos = [...new Set([v.image_url, ...(v.gallery_urls ?? [])].filter((u): u is string => Boolean(u)))].slice(0, 4);
    const hash = createHash("sha1")
      .update(JSON.stringify([v.name, v.type, v.description, v.vibe_tags, v.best_for, v.cuisines, photos, menu.map((m) => [m.name, m.price_ghs])]))
      .digest("hex");
    if (!ALL && seen.get(v.id) === hash) {
      skipped++;
      continue;
    }

    const images = (await Promise.all(photos.map((u) => ownImage(u)))).filter((x): x is { mime: string; data: Buffer } => x !== null);
    const confidence = images.length && menu.length >= 8 ? "high" : images.length || menu.length >= 8 ? "medium" : "low";
    const prices = menu.map((m) => Number(m.price_ghs)).sort((a, b) => a - b);
    const facts = [
      `Venue: ${v.name}, a ${v.type} in ${v.areas?.name ?? "Accra"}, Ghana.`,
      v.description ? `Description: ${v.description}` : "",
      v.vibe_tags?.length ? `Vibe tags: ${v.vibe_tags.join(", ")}.` : "",
      v.best_for?.length ? `Listed as good for: ${v.best_for.join(", ")}.` : "",
      v.cuisines?.length ? `Cuisines: ${v.cuisines.join(", ")}.` : "",
      v.dress_code ? `Dress code: ${v.dress_code}.` : "",
      menu.length
        ? `Menu, ${menu.length} items from GHS ${prices[0]} to ${prices[prices.length - 1]} (median ${prices[Math.floor(prices.length / 2)]}): ${menu
            .slice(0, 120)
            .map((m) => `${m.name} [${m.category}, ${m.price_ghs}]`)
            .join("; ")}`
        : "No menu on file.",
      images.length ? `${images.length} photo(s) of the venue are attached.` : "No photos.",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `${facts}

You are helping a date and outing planner in Accra choose where to send people. Judge this venue from the photos, the menu and the facts above only; when something cannot be told, say so rather than guess.
- noise: can a table hold a conversation? quiet (hushed, intimate), conversational (normal restaurant chatter), buzzy (lively, you raise your voice a little), loud (music or crowd you shout over: clubs, sports bars, DJ lounges). "unknown" if nothing shows it.
- occasion_fit: 0 to 10 for each occasion: how well it suits that outing in Accra. 5 is "fine, nothing special"; a sports bar is low for an anniversary; a quiet fine-dining room is low for a big friends' night out.
- signature_dishes: up to four items from THIS menu that the place is clearly built around or would be known for, named exactly as in the menu. Empty when there is no menu or nothing stands out. Never invent a dish.
- features: only what the photos or facts plainly show.
- basis: one sentence on what you judged from.`;

    const r = await geminiJSON<{
      noise: string;
      occasion_fit: Record<string, number>;
      signature_dishes: string[];
      features: string[];
      basis: string;
    }>({ parts: images.map((img) => ({ inline: img })), prompt, schema: SCHEMA, models });
    studied++;
    if (!r.ok) {
      console.log(`  ${v.name}: ${r.message}`);
      if (r.reason === "limit") break;
      await sleep(PACE_MS);
      continue;
    }
    const d = r.data;
    const menuNames = new Map(menu.map((m) => [m.name.toLowerCase(), m.name]));
    const row = {
      venue_id: v.id,
      noise: ["quiet", "conversational", "buzzy", "loud"].includes(d.noise) ? d.noise : null,
      occasion_fit: Object.fromEntries(
        OCCASIONS.filter((o) => Number.isFinite(Number(d.occasion_fit?.[o]))).map((o) => [o, Math.max(0, Math.min(10, Math.round(Number(d.occasion_fit[o]))))])
      ),
      // Only dishes really on our menu, spelled as we spell them.
      signature_dishes: (d.signature_dishes ?? [])
        .map((n) => menuNames.get(String(n).toLowerCase()) ?? null)
        .filter((n): n is string => Boolean(n))
        .slice(0, 4),
      features: (d.features ?? []).filter((f) => FEATURES.includes(f)),
      confidence,
      basis: (d.basis ?? "").slice(0, 400),
      model: r.model,
      inputs_hash: hash,
      studied_at: new Date().toISOString(),
    };
    const fits = Object.entries(row.occasion_fit).sort((a, b) => b[1] - a[1]);
    console.log(
      `${v.name} [${row.confidence}, ${r.model}]: ${row.noise ?? "noise?"} | best ${fits.slice(0, 2).map(([o, n]) => `${o} ${n}`).join(", ")} | worst ${fits
        .slice(-1)
        .map(([o, n]) => `${o} ${n}`)
        .join("")} | ${row.signature_dishes.join(", ") || "no signature"} | ${row.features.join(", ")}`
    );
    if (!DRY) {
      const { error: e } = await db.from("venue_insights").upsert(row, { onConflict: "venue_id" });
      if (e) throw new Error(`save ${v.name}: ${e.message}`);
    }
    await sleep(PACE_MS);
  }
  console.log(`\nStudied ${studied}, unchanged and skipped ${skipped}${DRY ? " (dry run, nothing saved)" : ""}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
