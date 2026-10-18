/**
 * Where does a group meet? Prints the fairest area for a few mixes of where
 * people are coming from, using the live areas and their centres. Read-only.
 *
 *   npx tsx scripts/fair-area-check.ts
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { areaCentroids } from "../src/lib/areaCentroids";
import { liveAreas } from "../src/lib/coverage";
import { fairestArea, type MergeMember } from "../src/lib/groupMerge";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const MIXES = [
  ["Dansoman", "Dansoman", "East Legon"],
  ["Dansoman", "Dansoman", "Dansoman"],
  ["Osu", "Spintex", "Achimota"],
  ["Labone", "Cantonments"],
  ["East Legon", "Madina", "Adenta"],
];

async function main() {
  const [{ data: areas }, centres, live] = await Promise.all([db.from("areas").select("id, name, city"), areaCentroids(db), liveAreas(db)]);
  const centre = new Map(centres.map((a) => [a.id, a]));
  const plannable = new Set(live.map((a) => a.id));
  const rows = (areas ?? []).map((a) => ({ ...a, lat: centre.get(a.id)?.lat ?? null, lng: centre.get(a.id)?.lng ?? null, plannable: plannable.has(a.id) }));
  const byName = new Map(rows.map((a) => [a.name, a]));
  for (const mix of MIXES) {
    const members: MergeMember[] = mix.map((name, i) => ({
      id: `m${i}`, name: `P${i}`, isOrganiser: i === 0, answered: true, availability: {}, vibes: [], hardNos: [], tags: [],
      fromAreaId: byName.get(name)?.id ?? null,
    }));
    const best = fairestArea(members, rows);
    console.log(`${mix.join(" + ").padEnd(36)} -> ${best?.name ?? "anywhere (surprise me)"}`);
  }
}
main();
