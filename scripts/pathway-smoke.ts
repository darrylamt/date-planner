/**
 * Do the two new pathways actually build a plan?
 *
 *   npx tsx scripts/pathway-smoke.ts
 *
 * A pathway is a promise, and the parts that could quietly break it are not
 * visible in a type check. A business meeting has to come back as exactly one
 * stop, of the kind that was asked for, because the stop floor was two
 * everywhere until now and a silent fall back to two would look deliberate. A
 * family day has to reach the activities and the beach venues rather than
 * returning the same restaurants a date night gets.
 *
 * Runs against the live catalogue, reads only, writes nothing.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fetchCandidates } from "../src/lib/matching";
import { planItinerary } from "../src/lib/planner";
import { defaultInputs, OCCASION_IDS } from "../src/lib/planConstants";
import { planInputsSchema } from "../src/lib/schemas";
import type { PlanInputs } from "../src/lib/types";

const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  -- ${detail}` : ""}`);
  ok ? passed++ : failed++;
}

async function build(inputs: PlanInputs) {
  const candidates = await fetchCandidates(admin as never, inputs);
  const plan = planItinerary(inputs, candidates);
  return { candidates, plan };
}

async function main() {
  /*
   * The door, before the planner.
   *
   * planInputsSchema is a second, hand-kept copy of what an occasion may be,
   * and it is the one that decides whether a request is heard at all. Both
   * pathways were added to the type, the constants, the themes, the mascots
   * and the planner and still failed every request, because this list had not
   * heard of them -- and the first version of this smoke test called the
   * planner directly, so it passed while the route returned 400.
   */
  console.log("\nTHE API SCHEMA -- every pathway the app offers must be accepted");
  for (const occasion of OCCASION_IDS) {
    const body = {
      ...defaultInputs(),
      occasion,
      vibes: ["Calm"],
      stops: occasion === "business_meeting" ? 1 : 2,
    };
    const parsed = planInputsSchema.safeParse(body);
    check(
      `${occasion} is valid input`,
      parsed.success,
      parsed.success ? "" : JSON.stringify(parsed.error.issues[0]?.path)
    );
  }

  console.log("\nBUSINESS MEETING -- one place, the kind asked for");
  for (const setting of ["cafe", "lounge", "restaurant"]) {
    const inputs: PlanInputs = {
      ...defaultInputs(),
      occasion: "business_meeting",
      occasionDetail: { setting },
      partySize: 3,
      stops: 1,
      hours: 2,
      startTime: "10:00",
      budget: 600,
      surpriseMe: true,
    };
    const { plan } = await build(inputs);
    if (!plan) {
      check(`${setting}: builds`, false, "no plan came back");
      continue;
    }
    check(`${setting}: exactly one stop`, plan.stops.length === 1, `got ${plan.stops.length}`);
    const type = plan.stops[0]?.venue.type;
    const want = setting === "restaurant" ? "restaurant" : setting;
    check(`${setting}: venue is a ${want}`, type === want, `got ${type}`);
    console.log(`         ${plan.stops[0]?.venue.name} (${type})`);
  }

  console.log("\nFAMILY DAY -- something to do, and it can reach the beach");
  {
    const inputs: PlanInputs = {
      ...defaultInputs(),
      occasion: "family_day",
      occasionDetail: { ages: "4 and 9" },
      partySize: 5,
      hours: 6,
      startTime: "11:00",
      budget: 1200,
      focus: "activities",
      surpriseMe: true,
    };
    const { plan } = await build(inputs);
    check("activities: builds a plan", Boolean(plan));
    if (plan) {
      const kinds = plan.stops.map((s) => s.venue.type);
      check(
        "activities: reaches an activity or outdoor venue",
        kinds.some((k) => k === "activity" || k === "outdoor"),
        kinds.join(", ")
      );
      console.log(`         ${plan.stops.map((s) => `${s.venue.name} (${s.venue.type})`).join(" -> ")}`);
    }
  }

  {
    const inputs: PlanInputs = {
      ...defaultInputs(),
      occasion: "family_day",
      occasionDetail: {},
      partySize: 4,
      hours: 6,
      startTime: "11:00",
      budget: 1500,
      vibes: ["Beach"],
      surpriseMe: true,
    };
    const { candidates, plan } = await build(inputs);
    const beachy = candidates.venues.filter((v) =>
      (v.vibe_tags ?? []).some((t) => t.toLowerCase() === "beach")
    );
    check("beach: a beach venue is in the running", beachy.length > 0, `${beachy.length} shortlisted`);
    check("beach: builds a plan", Boolean(plan));
    if (plan) {
      console.log(`         ${plan.stops.map((s) => s.venue.name).join(" -> ")}`);
    }
  }

  console.log("\nREGRESSION -- an ordinary evening still does not collapse to one stop");
  {
    const inputs: PlanInputs = {
      ...defaultInputs(),
      occasion: "date_night",
      partySize: 2,
      hours: 4,
      budget: 800,
      surpriseMe: true,
    };
    const { plan } = await build(inputs);
    check("date night: two or more stops", (plan?.stops.length ?? 0) >= 2, `got ${plan?.stops.length}`);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
