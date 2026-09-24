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
import { defaultInputs, defaultStopsFor, OCCASION_IDS } from "../src/lib/planConstants";
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
      /*
       * What the app actually sends, not a value chosen to pass.
       *
       * This line read `occasion === "business_meeting" ? 1 : 2` and so tested
       * a number the questionnaire never produces. The real default is
       * defaultStopsFor, which returns 0 for "up to you" -- and 0 was refused
       * by the schema, so every pathway but the meeting failed in production
       * while this test stayed green.
       */
      stops: defaultStopsFor(occasion),
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
    const base: PlanInputs = {
      ...defaultInputs(),
      occasion: "business_meeting",
      occasionDetail: { setting },
      partySize: 3,
      stops: 1,
      hours: 2,
      startTime: setting === "lounge" ? "17:00" : "10:00",
      surpriseMe: true,
      budget: 1500,
    };

    // With room in the budget, the kind asked for.
    const { plan } = await build(base);
    if (!plan) {
      check(`${setting}: builds at GHS 1500`, false, "no plan came back");
    } else {
      check(`${setting}: exactly one stop`, plan.stops.length === 1, `got ${plan.stops.length}`);
      const type = plan.stops[0]?.venue.type;
      check(`${setting}: venue is a ${setting}`, type === setting, `got ${type}`);
      console.log(`         ${plan.stops[0]?.venue.name} (${type})`);
    }

    /*
     * Without room: the kind asked for, or nothing -- never a substitute.
     *
     * This used to accept whatever came back, which is how a cafe meeting at
     * GHS 600 for three was "passing" while sitting in Treehouse Restaurant.
     */
    const tight = await build({ ...base, budget: 600 });
    const t = tight.plan?.stops[0]?.venue.type;
    check(`${setting}: at GHS 600, a ${setting} or an honest no`, !tight.plan || t === setting, `got ${t ?? "no plan"}`);
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

  console.log("\nCITY -- a plan stays inside one city");
  {
    const { data: areaRows } = await admin.from("areas").select("id,name,city");
    const cityOf = new Map(((areaRows ?? []) as { id: string; city: string | null }[]).map((a) => [a.id, a.city || "Accra"]));
    for (const occasion of ["date_night", "business_meeting"] as const) {
      const inputs: PlanInputs = {
        ...defaultInputs(),
        occasion,
        occasionDetail: occasion === "business_meeting" ? { setting: "restaurant" } : {},
        stops: defaultStopsFor(occasion),
        vibes: ["Calm"],
        surpriseMe: true,
        city: "Accra",
      };
      const { candidates, plan } = await build(inputs);
      const outside = candidates.venues.filter((v) => cityOf.get(v.area_id) !== "Accra");
      check(`${occasion}: no candidate outside Accra`, outside.length === 0, outside.map((v) => v.name).join(", "));
      check(`${occasion}: still builds`, Boolean(plan));
    }
    const bogus = await build({ ...defaultInputs(), vibes: ["Calm"], surpriseMe: true, city: "Atlantis" });
    check("unknown city falls back to Accra instead of failing", Boolean(bogus.plan));
  }

  console.log("\nWELLNESS -- only when asked, only for one or two, and a real treatment");
  {
    const { count } = await admin
      .from("venues")
      .select("id", { count: "exact", head: true })
      .eq("type", "wellness")
      .eq("is_active", true);
    const friends = await build({ ...defaultInputs(), occasion: "friend_outing", partySize: 4, vibes: ["Calm"], surpriseMe: true, wellness: true });
    check("a group of four is never given a spa", !friends.candidates.venues.some((v) => v.type === "wellness"));

    if (!count) {
      console.log("   SKIP  no wellness venues yet -- run 0055, then 0056, then this again");
    } else {
      const duo = await build({
        ...defaultInputs(),
        occasion: "date_night",
        partySize: 2,
        hours: 4,
        startTime: "13:00",
        budget: 2500,
        vibes: ["Calm"],
        surpriseMe: true,
        wellness: true,
      });
      const first = duo.plan?.stops[0];
      check("a duo who asked gets a spa first", first?.venue.type === "wellness", `${first?.venue.name} (${first?.venue.type})`);
      const lines = (first as unknown as { orders?: { price_ghs: number; qty: number }[] })?.orders ?? [];
      const cheapest = Math.min(...lines.map((o) => o.price_ghs / Math.max(1, o.qty)));
      check("and it is a treatment, not an add-on", lines.length > 0 && cheapest >= 100, `cheapest line GHS ${cheapest}`);
      const without = await build({ ...defaultInputs(), occasion: "date_night", partySize: 2, vibes: ["Calm"], surpriseMe: true });
      check("nobody who did not ask is given one", !without.candidates.venues.some((v) => v.type === "wellness"));
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
