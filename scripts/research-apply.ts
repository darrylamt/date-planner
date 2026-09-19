/**
 * Apply a research CSV to the catalogue.
 *
 *   npm run research:apply -- batch.csv          # shows what it would do
 *   npm run research:apply -- batch.csv --write  # does it
 *
 * The same rules as the admin's "Fill in venues" mode, from a terminal, so a
 * batch can be checked and applied in one place rather than pasted into a
 * browser.
 *
 * ── what it will not do ─────────────────────────────────────────────────
 * Never blanks a field. An empty cell means the research found nothing, which
 * is different from finding that a venue has no description, and the second
 * is not a claim this process is entitled to make. So a value is only ever
 * written over nothing, and re-running a batch later only adds.
 *
 * price_band and aesthetics are not accepted from a file at all. Those decide
 * which budgets a venue appears in and how it ranks against its neighbours.
 *
 * ── the two corrections it makes ────────────────────────────────────────
 * A best_for value found in vibe_tags is moved to the column it belongs in
 * rather than dropped, because "friend_outing" in the wrong cell is a model
 * confusing two lists and not a model being wrong about the venue. Anything
 * else outside the vocabulary is dropped and reported.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const VIBES = [
  "casual", "calm", "chill", "fun", "lively", "romantic", "foodie", "upscale",
  "adventurous", "outdoorsy", "dancing", "sporty", "scenic", "beach", "artsy",
];
const BEST_FOR = ["date_night", "first_date", "friend_outing", "casual_hangout", "anniversary"];
/*
 * evidence_url is read and never written.
 *
 * A handle is the one field where being wrong sends a real person to a
 * stranger's account, so the prompt asks for the profile link beside it and
 * the check confirms the two agree. It is not a venue column and never
 * reaches the database -- it exists so a claim can be audited before it is
 * believed.
 */
const KNOWN = [
  "name", "description", "vibe_tags", "best_for", "cuisines", "dress_code",
  "instagram_handle", "evidence_url",
];

/** Spellings that would split one kitchen in two. Extend as they turn up. */
const CUISINE_ALIASES: Record<string, string> = {
  "afro-caribbean": "caribbean",
  "afro caribbean": "caribbean",
  "west african": "local",
  "african": "local",
  "asian-fusion": "asian",
  "asian fusion": "asian",
  // What a menu in Accra means by "international" is what this catalogue has
  // called continental in 35 other places. Two words for one thing is two
  // kitchens the planner cannot match across.
  international: "continental",
  western: "continental",
  european: "continental",
  // A dish, not a cuisine, and the cuisine it implies is already in use.
  sushi: "japanese",
};

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function main() {
  const file = process.argv[2];
  const write = process.argv.includes("--write");
  if (!file) {
    console.error("Usage: npm run research:apply -- batch.csv [--write]");
    process.exit(1);
  }

  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  const db = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE,
    { auth: { persistSession: false } }
  );

  type V = {
    id: string; name: string; description: string | null;
    vibe_tags: string[] | null; best_for: string[] | null;
    cuisines: string[] | null; cuisine: string | null;
    dress_code: string | null; instagram_handle: string | null;
  };
  const { data } = await db
    .from("venues")
    .select("id, name, description, vibe_tags, best_for, cuisines, cuisine, dress_code, instagram_handle")
    .eq("is_active", true);
  const venues = (data ?? []) as unknown as V[];
  const byName = new Map(venues.map((v) => [v.name.trim().toLowerCase(), v]));

  const lines = fs.readFileSync(path.resolve(file), "utf8").split(/\r?\n/).filter((l) => l.trim());
/*
 * The header the file actually has, not the one this script would prefer.
 *
 * A research pass is often narrower than the full form -- a round that only
 * chases descriptions comes back as `name,description`, and demanding all
 * seven columns would reject a perfectly good batch. So: `name` must be
 * first, every other column must be one this understands, and anything not
 * present is simply not written.
 */
  const HEADER = parseLine(lines[0]).map((h) => h.trim());
  if (HEADER[0] !== "name") {
    console.error(`First column is "${HEADER[0]}", expected "name". Nothing applied.`);
    process.exit(1);
  }
  const rows = lines.slice(1).map(parseLine);
  console.log(
    `Columns: ${HEADER.filter((h) => h !== "name").join(", ") || "none besides name"}` +
      (HEADER.some((h) => !KNOWN.includes(h))
        ? `  (ignoring ${HEADER.filter((h) => !KNOWN.includes(h)).join(", ")})`
        : "")
  );

  const planned: { name: string; id: string; values: Record<string, unknown>; why: string[] }[] = [];
  const skipped: string[] = [];

  for (const [i, r] of rows.entries()) {
    const n = i + 2;
    const name = (r[0] ?? "").trim();
    if (!name) continue;

    const v = byName.get(name.toLowerCase());
    if (!v) { skipped.push(`Row ${n} "${name}": no venue with this name`); continue; }

    const get = (k: string) => (r[HEADER.indexOf(k)] ?? "").trim();
    const list = (k: string) =>
      get(k).split(/[;|]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

    const values: Record<string, unknown> = {};
    const why: string[] = [];

    // Text fields, only over nothing.
    for (const k of ["description", "dress_code", "instagram_handle"] as const) {
      const raw = get(k);
      if (!raw) continue;
      const existing = (v[k] ?? "").toString().trim();
      if (existing) { why.push(`${k} already set, left alone`); continue; }
      /*
       * A handle only goes in with a link that backs it, and only when that
       * link is the handle's own profile. Everything else here is a
       * description somebody can disagree with; this one sends a person
       * somewhere, and the wrong one sends them to a stranger.
       */
      if (k === "instagram_handle") {
        // Chat interfaces auto-link, so a bare URL often arrives as
        // `[url](url)`. That is a rendering artifact, not bad data.
        const evRaw = get("evidence_url");
        const ev = (evRaw.match(/\]\((https?:[^)]+)\)\s*$/)?.[1] ?? evRaw.replace(/^\[|\]$/g, "")).trim();
        const tail = ev.toLowerCase().replace(/\/+$/, "").split("/").pop() ?? "";
        if (!ev || !ev.toLowerCase().includes("instagram.com") || tail !== raw.replace(/^@/, "").toLowerCase()) {
          why.push(`handle "${raw}" skipped: no matching evidence_url`);
          continue;
        }
      }
      values[k] = raw;
    }

    // Tags, with the one correction worth making.
    const rawVibes = list("vibe_tags");
    const rawBest = list("best_for");
    const misfiled = rawVibes.filter((t) => BEST_FOR.includes(t));
    const vibes = rawVibes.filter((t) => VIBES.includes(t));
    const dropped = rawVibes.filter((t) => !VIBES.includes(t) && !BEST_FOR.includes(t));
    if (misfiled.length) why.push(`moved ${misfiled.join(", ")} from vibe_tags to best_for`);
    if (dropped.length) why.push(`dropped unknown tag ${dropped.join(", ")}`);

    const best = [...new Set([...rawBest, ...misfiled])].filter((t) => BEST_FOR.includes(t));
    const badBest = rawBest.filter((t) => !BEST_FOR.includes(t));
    if (badBest.length) why.push(`dropped unknown best_for ${badBest.join(", ")}`);

    if (vibes.length && !(v.vibe_tags ?? []).length) values.vibe_tags = vibes;
    else if (vibes.length) why.push("vibe_tags already set, left alone");
    if (best.length && !(v.best_for ?? []).length) values.best_for = best;
    else if (best.length) why.push("best_for already set, left alone");

    const cuisines = list("cuisines").map((c) => {
      const mapped = CUISINE_ALIASES[c];
      if (mapped) why.push(`cuisine "${c}" -> "${mapped}"`);
      return mapped ?? c;
    });
    if (cuisines.length && !(v.cuisines ?? []).length) values.cuisines = [...new Set(cuisines)];
    else if (cuisines.length) why.push("cuisines already set, left alone");

    if (!Object.keys(values).length) { skipped.push(`Row ${n} "${name}": nothing new`); continue; }
    planned.push({ name: v.name, id: v.id, values, why });
  }

  console.log(`\n${planned.length} venues to update, ${skipped.length} rows with nothing to do.\n`);
  for (const p of planned) {
    console.log(`  ${p.name}`);
    for (const [k, val] of Object.entries(p.values))
      console.log(`     ${k}: ${Array.isArray(val) ? val.join("; ") : String(val).slice(0, 84)}`);
    for (const w of p.why) console.log(`     · ${w}`);
  }
  if (skipped.length) {
    console.log("\nNothing to do:");
    for (const s of skipped) console.log("  - " + s);
  }

  if (!write) {
    console.log("\nDry run. Re-run with --write to apply.");
    return;
  }

  let ok = 0;
  for (const p of planned) {
    const { data: back, error } = await db
      .from("venues")
      .update(p.values)
      .eq("id", p.id)
      .select("id");
    // .select() because an update matching nothing is a success in PostgREST.
    if (error) console.log(`  FAILED ${p.name}: ${error.message}`);
    else if (!back?.length) console.log(`  FAILED ${p.name}: matched no row`);
    else ok += 1;
  }
  console.log(`\nUpdated ${ok} of ${planned.length}.`);
}

void main();
