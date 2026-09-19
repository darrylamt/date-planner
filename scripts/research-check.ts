/**
 * Check a research CSV before it touches the catalogue.
 *
 *   npm run research:check -- path/to/file.csv
 *
 * The import screen's dry run tells you what it would write. This tells you
 * what the model got wrong, which is a different question and the one worth
 * asking first: a name it edited, a tag outside the vocabulary and a row with
 * the wrong number of fields all import "successfully" while losing the data.
 *
 * Read-only. Reports, changes nothing.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const VIBES = [
  "casual", "calm", "chill", "fun", "lively", "romantic", "foodie", "upscale",
  "adventurous", "outdoorsy", "dancing", "sporty", "scenic", "beach", "artsy",
];
const BEST_FOR = ["date_night", "first_date", "friend_outing", "casual_hangout", "anniversary"];
const KNOWN = ["name", "description", "vibe_tags", "best_for", "cuisines", "dress_code", "instagram_handle"];

/** Minimal CSV reader: quoted fields, doubled quotes, no embedded newlines. */
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
  if (!file) {
    console.error("Usage: npm run research:check -- path/to/file.csv");
    process.exit(1);
  }

  const envPath = path.join(process.cwd(), ".env.local");
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  const db = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE,
    { auth: { persistSession: false } }
  );

  const { data: venues } = await db
    .from("venues")
    .select("name, cuisines, cuisine")
    .eq("is_active", true);
  const byName = new Map(
    ((venues ?? []) as { name: string }[]).map((v) => [v.name.trim().toLowerCase(), v.name])
  );
  /*
   * Both columns. `cuisines` is the array and `cuisine` is the older singular
   * that 0022 added, and most of the catalogue is still on the second one --
   * reading only the array reported "continental" as a new word while 35
   * venues were using it, which is the opposite of the warning's job.
   */
  const knownCuisines = new Set<string>();
  for (const v of (venues ?? []) as { cuisines: string[] | null; cuisine: string | null }[]) {
    for (const c of v.cuisines ?? []) knownCuisines.add(c.toLowerCase());
    if (v.cuisine) knownCuisines.add(v.cuisine.toLowerCase());
  }

  const lines = fs
    .readFileSync(path.resolve(file), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const head = parseLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map(parseLine);

  const problems: string[] = [];
  const notes: string[] = [];

/*
 * The header the file actually has, not the one this script would prefer.
 *
 * A research pass is often narrower than the full form -- a round that only
 * chases descriptions comes back as `name,description`, and demanding all
 * seven columns would reject a perfectly good batch. So: `name` must be
 * first, every other column must be one this understands, and anything not
 * present is simply not written.
 */
  const HEADER = head;
  if (head[0] !== "name") {
    problems.push(`First column is "${head[0]}", expected "name".`);
  }
  const unknown = head.filter((h) => !KNOWN.includes(h));
  if (unknown.length) {
    problems.push(`Unknown columns ignored: ${unknown.join(", ")}. Known: ${KNOWN.join(", ")}.`);
  }
  const covered = KNOWN.filter((k) => head.includes(k) && k !== "name");
  console.log(`Columns in this file: ${covered.join(", ") || "none besides name"}`);

  let usable = 0;
  let blank = 0;

  rows.forEach((r, i) => {
    const n = i + 2;
    const name = (r[0] ?? "").trim();
    if (!name) return;

    /*
     * A short row is only dangerous if it could have shifted a value into the
     * wrong column. When every field that is present past the shortfall is
     * empty, the model simply stopped emitting trailing commas and nothing is
     * lost -- which is most of them, and reporting those as problems buried
     * the two that mattered.
     */
    if (r.length !== HEADER.length) {
      const tail = r.slice(1).filter((x) => x.trim());
      const harmless = tail.length <= Math.max(0, HEADER.length - 1);
      const msg =
        `Row ${n} "${name}": ${r.length} fields, header has ${HEADER.length}` +
        (harmless ? " (trailing empties, nothing lost)" : " — values may be in the wrong columns");
      if (harmless) notes.push(msg);
      else problems.push(msg);
    }

    const matched = byName.get(name.toLowerCase());
    if (!matched) {
      // Near-miss detection, because an edited name is the usual cause.
      const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const near = [...byName.values()].find((v) => squash(v) === squash(name));
      problems.push(
        near
          ? `Row ${n} "${name}": no exact match. Did it mean "${near}"? (punctuation or accent changed)`
          : `Row ${n} "${name}": no venue with this name.`
      );
      return;
    }

    const get = (k: string) => (r[HEADER.indexOf(k)] ?? "").trim();
    const list = (k: string) =>
      get(k).split(/[;|]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

    const vibes = list("vibe_tags");
    const strayVibes = vibes.filter((t) => !VIBES.includes(t));
    if (strayVibes.length) {
      const asBestFor = strayVibes.filter((t) => BEST_FOR.includes(t));
      problems.push(
        `Row ${n} "${name}": vibe_tags has ${strayVibes.map((t) => `"${t}"`).join(", ")}` +
          (asBestFor.length ? " — that is a best_for value, in the wrong column" : "") +
          ". Dropped on import."
      );
    }

    const bf = list("best_for");
    const strayBf = bf.filter((t) => !BEST_FOR.includes(t));
    if (strayBf.length) {
      /*
       * Every value in best_for being wrong, on a row that is also short, is
       * not a vocabulary mistake -- it is a column that was never emitted, so
       * everything after it slid one place left. Said explicitly because the
       * fix is to realign the row, and the automatic correction elsewhere
       * would otherwise move one tag across and drop the rest as rubbish.
       */
      const shifted = bf.length === strayBf.length && r.length < HEADER.length;
      problems.push(
        `Row ${n} "${name}": best_for has ${strayBf.map((t) => `"${t}"`).join(", ")}. ` +
          (shifted
            ? "None of them are best_for values and the row is short — a column was skipped and everything after it shifted left. Realign this row by hand."
            : "Dropped.")
      );
    }

    for (const c of list("cuisines")) {
      if (knownCuisines.has(c)) continue;
      /*
       * A word that is nearly one already in use is the one to catch:
       * "afro-caribbean" beside an existing "caribbean" splits one kitchen
       * into two that the planner matches separately.
       */
      const near = [...knownCuisines].find(
        (k) => k.includes(c) || c.includes(k)
      );
      notes.push(
        near
          ? `Row ${n} "${name}": cuisine "${c}" is close to "${near}", already in use. Pick one.`
          : `Row ${n} "${name}": new cuisine "${c}".`
      );
    }

    const desc = get("description");
    if (desc.length > 220) problems.push(`Row ${n} "${name}": description is ${desc.length} chars, max 220.`);
    if (/nestled|vibrant tapestry|heart of|!/.test(desc)) {
      notes.push(`Row ${n} "${name}": description reads like marketing copy.`);
    }

    const ig = get("instagram_handle");
    if (ig && !ig.startsWith("@")) problems.push(`Row ${n} "${name}": instagram_handle "${ig}" has no @.`);

    const anything = KNOWN.slice(1).some((k) => get(k));
    if (anything) usable += 1;
    else blank += 1;
  });

  console.log(`\n${rows.length} rows: ${usable} carry data, ${blank} came back empty.\n`);

  if (problems.length) {
    console.log(`PROBLEMS (${problems.length}) — fix before importing:`);
    for (const p of problems) console.log("  - " + p);
  } else {
    console.log("No problems found.");
  }

  if (notes.length) {
    console.log(`\nWorth a look (${notes.length}):`);
    for (const nn of notes) console.log("  - " + nn);
  }

  /*
   * A batch where nothing came back empty is the suspicious one. The prompt
   * asks for blanks wherever the model could not confirm something, and a
   * model that found every one of twenty obscure Accra venues did not.
   */
  if (rows.length >= 10 && blank === 0) {
    console.log(
      "\nNOTE: every row came back filled. The prompt asks for blanks where nothing\n" +
        "was found, so spot-check three rows against a real search before importing."
    );
  }
}

void main();
