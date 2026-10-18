/**
 * How often does Swap have something to swap to?
 *
 *   npx tsx scripts/swap-check.ts            the last 80 saved plans' answers
 *   npx tsx scripts/swap-check.ts --n 200
 *
 * Replays real answers from saved plans through today's planner and catalogue
 * (dates moved to the same weekday ahead, so opening hours still apply) and
 * counts the alternates each stop carries. A stop with none is a Swap tap
 * that says "Nothing else fits here." Read-only: nothing is written.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fetchCandidates } from "../src/lib/matching";
import { planItinerary } from "../src/lib/planner";
import { planInputsSchema } from "../src/lib/schemas";
import type { PlanInputs } from "../src/lib/types";

const env: Record<string, string> = { ...(process.env as Record<string, string>) };
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const N = Number(process.argv[process.argv.indexOf("--n") + 1]) || 80;

/** The same weekday on or after today, so a past plan is replayed on a real future evening. */
function ahead(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  while (d < now) d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { data, error } = await db.from("plans").select("inputs").order("created_at", { ascending: false }).limit(N);
  if (error) throw error;
  let plans = 0;
  let stops = 0;
  const byCount = [0, 0, 0, 0, 0, 0];
  const emptyByType: Record<string, number> = {};
  const stopsByType: Record<string, number> = {};
  for (const row of data ?? []) {
    const raw = row.inputs as PlanInputs;
    if (!raw?.occasion || !raw.date) continue;
    // Through the server's own schema, so an older plan's answers take today's defaults.
    const parsed = planInputsSchema.safeParse({ ...raw, date: ahead(raw.date) });
    if (!parsed.success) continue;
    const inputs = parsed.data as PlanInputs;
    const candidates = await fetchCandidates(db as never, inputs);
    const plan = planItinerary(inputs, candidates);
    if (!plan) continue;
    plans++;
    for (const s of plan.stops) {
      stops++;
      const n = Math.min(5, s.alternates.length);
      byCount[n]++;
      stopsByType[s.venue.type] = (stopsByType[s.venue.type] ?? 0) + 1;
      if (!n) emptyByType[s.venue.type] = (emptyByType[s.venue.type] ?? 0) + 1;
    }
  }
  const pct = (x: number) => `${Math.round((x / Math.max(1, stops)) * 100)}%`;
  console.log(`${plans} plans, ${stops} stops`);
  byCount.forEach((n, i) => console.log(`  ${i}${i === 5 ? "+" : ""} alternates: ${n} (${pct(n)})`));
  console.log("  no swap, by kind:", Object.entries(emptyByType).map(([t, n]) => `${t} ${n}/${stopsByType[t]}`).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
