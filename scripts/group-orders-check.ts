/**
 * Do group plans keep their promises?
 *
 *   npx tsx scripts/group-orders-check.ts            (npm run group:check)
 *
 * Runs planGroup (src/lib/groupPlan.ts) on the live catalogue for hundreds of
 * random groups and checks, for every plan it makes:
 *   - each person's evening costs no more than their own budget;
 *   - shared costs and rides are split evenly;
 *   - no door or court line is anybody's personal order, and no personal
 *     order sits at a shared stop;
 *   - a person with no seafood / no pork / no alcohol gets none;
 *   - what everyone sees (sharedItinerary) names no dish from anyone's own
 *     order and carries no figure that is not a shared cost.
 * A plan may fail to fit ("no_fit"); it may never break a rule. Read-only.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fetchCandidates } from "../src/lib/matching";
import { planGroup, planForCopy, sharedItinerary, groupViolations, GROUP_BUDGET_NOTE, type GroupPerson } from "../src/lib/groupPlan";
import { fallbackCopy } from "../src/lib/copy";
import { assembleItinerary } from "../src/lib/itinerary";
import { planInputsSchema } from "../src/lib/schemas";
import type { HardNo } from "../src/lib/groups";
import type { MenuItem, PlanInputs } from "../src/lib/types";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
// The planner reads the catalogue the way the app does, through the anon key.
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// Seeded, so a failure can be run again exactly.
let seed = Number(process.env.SEED ?? 20261018);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

const SEAFOOD =
  /\b(sea ?food|fish|tilapia|salmon|tuna|prawns?|shrimps?|crabs?|lobsters?|calamari|squid|octopus|oysters?|mussels?|clams?|sushi|sashimi|snapper|grouper|mackerel|anchov(y|ies)|kingfish)\b/i;
const PORK = /\b(pork|bacon|ham|pepperoni|salami|prosciutto|chorizo|pancetta)\b/i;

const SETUPS = [
  { name: "Osu evening", area: "Osu", occasion: "friend_outing", startTime: "19:00", vibes: ["Fun", "Lively"] },
  { name: "East Legon daytime", area: "East Legon", occasion: "birthday", startTime: "13:00", vibes: ["Chill", "Foodie"] },
  { name: "Labone evening", area: "Labone", occasion: "celebration", startTime: "19:00", vibes: ["Calm"] },
] as const;

async function main() {
  const { data: areas } = await db.from("areas").select("id, name, city");
  const runs = Number(process.env.RUNS ?? 100);
  let ok = 0;
  let noFit = 0;
  let withPersonal = 0;
  let richerSpendsMore = 0;
  let pairs = 0;
  let maxDiff = 0;
  const failures: string[] = [];

  for (const setup of SETUPS) {
    const area = (areas ?? []).find((a) => a.name === setup.area);
    if (!area) {
      failures.push(`${setup.name}: no area ${setup.area}`);
      continue;
    }
    const base = planInputsSchema.parse({
      areaIds: [area.id],
      areaNames: [area.name],
      city: area.city ?? "Accra",
      partySize: 4,
      budget: 800 * 4,
      date: "2026-11-07",
      startTime: setup.startTime,
      hours: 4,
      vibes: [...setup.vibes],
      occasion: setup.occasion,
      crew: "mixed",
      ai: false,
      partner: {},
    }) as PlanInputs;
    // One fetch per setup, generous enough to cover most budgets; the planner checks menus itself.
    const candidates = await fetchCandidates(db, base);
    const menuByName = new Map<string, MenuItem>();
    for (const m of candidates.menuItems) menuByName.set(`${m.venue_id}|${m.name}`, m);

    for (let r = 0; r < runs; r++) {
      const n = 2 + Math.floor(rand() * 11);
      const people: GroupPerson[] = Array.from({ length: n }, (_, i) => {
        const budget = rand() < 0.1 ? Math.floor(rand() * 200) * 50 : (4 + Math.floor(rand() * 40)) * 50;
        const nos = new Set<HardNo>();
        if (rand() < 0.15) nos.add("no_seafood");
        if (rand() < 0.1) nos.add("no_pork");
        if (rand() < 0.15) nos.add("no_alcohol");
        if (rand() < 0.05) nos.add(pick(["no_clubs", "no_loud_music", "no_smoke"] as const));
        return { memberId: `m${i}`, name: `Person ${i + 1}`, budget, nos };
      });
      const inputs = { ...base, partySize: n, companions: people.map((p) => p.name) };
      const out = planGroup(inputs, candidates, people, { variety: () => 0 });
      if (out.status !== "ok") {
        noFit += 1;
        continue;
      }
      ok += 1;
      const tag = `${setup.name} #${r} (n=${n}, budgets ${people.map((p) => p.budget).join("/")})`;

      for (const v of groupViolations(out, people)) failures.push(`${tag}: ${v}`);
      if (out.shared.some((s) => s.personal)) withPersonal += 1;
      const byBudget = [...people].sort((a, b) => a.budget - b.budget);
      const lo = out.members.get(byBudget[0].memberId)!;
      const hi = out.members.get(byBudget[byBudget.length - 1].memberId)!;
      if (byBudget[0].budget < byBudget[byBudget.length - 1].budget) {
        pairs += 1;
        if (hi.personal_ghs >= lo.personal_ghs) richerSpendsMore += 1;
        maxDiff = Math.max(maxDiff, hi.personal_ghs - lo.personal_ghs);
      }

      for (const p of people) {
        const mine = out.members.get(p.memberId)!;
        for (const s of mine.stops) {
          for (const o of s.orders) {
            const item = menuByName.get(`${s.venue_id}|${o.item}`);
            if (p.nos.has("no_seafood") && SEAFOOD.test(`${o.item} ${item?.notes ?? ""}`)) failures.push(`${tag}: seafood for ${p.name}: ${o.item}`);
            if (p.nos.has("no_pork") && PORK.test(`${o.item} ${item?.notes ?? ""}`)) failures.push(`${tag}: pork for ${p.name}: ${o.item}`);
            if (p.nos.has("no_alcohol") && item?.category === "drink" && item.is_alcoholic !== false)
              failures.push(`${tag}: a drink that may be alcoholic for ${p.name}: ${o.item}`);
          }
        }
      }

      // What everyone sees.
      const copy = fallbackCopy({ ...inputs, budget: 0 }, planForCopy(out));
      const full = assembleItinerary(inputs, planForCopy(out), copy);
      const shared = sharedItinerary(full, out, "TESTCODE00000000");
      const sharedText = JSON.stringify(shared);
      if (shared.budget_note !== GROUP_BUDGET_NOTE) failures.push(`${tag}: budget note`);
      if (shared.stops.some((s) => (s.alternates ?? []).length)) failures.push(`${tag}: alternates left in`);
      const sharedNames = new Set(shared.stops.flatMap((s) => s.orders.map((o) => o.item)));
      for (const p of people) {
        for (const s of out.members.get(p.memberId)!.stops) {
          for (const o of s.orders) {
            if (!sharedNames.has(o.item) && sharedText.includes(JSON.stringify(o.item))) {
              failures.push(`${tag}: ${p.name}'s ${o.item} visible to everyone`);
            }
          }
        }
        if (sharedText.includes(`"${p.budget}"`) && p.budget > 0) {
          // A budget written as a string anywhere would be a leak; numbers that happen to match are checked below.
          failures.push(`${tag}: a budget appears as text`);
        }
      }
      const expectTotal = out.shared.reduce((s, x) => s + x.total_ghs, 0) + out.rides_ghs;
      if (shared.est_total_ghs !== expectTotal) failures.push(`${tag}: shared total ${shared.est_total_ghs} is not the shared costs ${expectTotal}`);
    }
  }

  const unique = [...new Set(failures)];
  for (const f of unique.slice(0, 40)) console.log("FAIL ", f);
  console.log(`\n${ok} plans checked, ${noFit} did not fit, ${unique.length} problems`);
  console.log(`${withPersonal} of ${ok} have stops where people order for themselves`);
  console.log(`richest orders at least as much as poorest in ${richerSpendsMore} of ${pairs}; widest gap GHS ${maxDiff}`);
  process.exit(unique.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
