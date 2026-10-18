/**
 * Does a venue's feel follow the clock?
 *
 *   npx tsx scripts/day-energy-check.ts
 *
 * Reads the live venues that carry a day_energy (migration 0082) and checks,
 * through the same helper the planner and shortlist use, that each one counts
 * as its day energy at 11:00 and as its evening tags at 21:00. Read-only.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { vibeTagsAt, vibeTagsDuring } from "../src/lib/dayEnergy";
import { expandVibes } from "../src/lib/catalog";
import type { Venue } from "../src/lib/types";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function main() {
  // Through the anon key, as the planner reads: proves the column grant too.
  const { data, error } = await db.from("venues").select("id, name, vibe_tags, day_energy").not("day_energy", "is", null);
  if (error) throw new Error(error.message);
  const venues = (data ?? []) as Pick<Venue, "id" | "name" | "vibe_tags" | "day_energy">[];
  let failed = 0;
  const check = (name: string, pass: boolean, detail = "") => {
    if (!pass) failed++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`);
  };
  check("anon key can read day_energy", venues.length > 0, `${venues.length} venues`);

  const calm = expandVibes(["Calm"]);
  const lively = expandVibes(["Lively"]);
  for (const v of venues) {
    const morning = vibeTagsAt(v, 11 * 60);
    const night = vibeTagsAt(v, 21 * 60);
    const late = vibeTagsAt(v, 25 * 60); // 1am, still the night
    const ok =
      morning.includes(v.day_energy!) &&
      !morning.includes("dancing") &&
      night.join() === v.vibe_tags.join() &&
      late.join() === v.vibe_tags.join();
    if (!ok) check(v.name, false, `11:00 [${morning}] 21:00 [${night}]`);
  }
  check("every venue switches at the right times", failed === 0 || venues.length === 0);

  const ritual = venues.find((v) => v.name === "RITUAL");
  if (ritual) {
    check("RITUAL fits Calm at brunch", vibeTagsAt(ritual, 11 * 60).some((t) => calm.includes(t)));
    check("RITUAL is its evening self at nine", vibeTagsAt(ritual, 21 * 60).join() === ritual.vibe_tags.join(), vibeTagsAt(ritual, 21 * 60).join());
  }
  const polo = venues.find((v) => v.name === "Polo Beach Club");
  if (polo) {
    check("Polo Beach Club is not Lively at lunch", !vibeTagsAt(polo, 13 * 60).some((t) => t === "lively"), vibeTagsAt(polo, 13 * 60).join());
    check("Polo Beach Club is Lively at ten", vibeTagsAt(polo, 22 * 60).some((t) => lively.includes(t)));
    check(
      "an afternoon-to-night plan shortlists it for either",
      vibeTagsDuring(polo as Venue, 16 * 60, 6 * 60).includes("lively") && vibeTagsDuring(polo as Venue, 16 * 60, 6 * 60).includes("chill")
    );
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
main();
