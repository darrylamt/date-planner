/**
 * Which areas cannot fill a plan on their own, and whether reaching 8 km
 * further rescues it. Same requests in every area, against the live catalogue.
 *
 *   npm run reach:check
 *
 * Mirrors the generate route: the chosen area at the default reach first,
 * then once more at REACH_FALLBACK_KM if that failed.
 */
import fs from "fs";
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
import { createClient } from "@supabase/supabase-js";
import { fetchCandidates } from "../src/lib/matching";
import { planItinerary } from "../src/lib/planner";
import { REACH_FALLBACK_KM, defaultInputs } from "../src/lib/planConstants";
import type { PlanInputs } from "../src/lib/types";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const REQUESTS: { label: string; inputs: Partial<PlanInputs> }[] = [
  { label: "first date, 2, GHS 800, evening", inputs: { occasion: "first_date", partySize: 2, budget: 800, startTime: "18:30", hours: 4 } },
  { label: "date night, 2, GHS 1500, evening", inputs: { occasion: "date_night", partySize: 2, budget: 1500, startTime: "19:00", hours: 4 } },
  { label: "friends, 4, GHS 1500, evening", inputs: { occasion: "friend_outing", partySize: 4, budget: 1500, startTime: "18:00", hours: 5 } },
  { label: "birthday, 6, GHS 3000, afternoon", inputs: { occasion: "birthday", partySize: 6, budget: 3000, startTime: "14:00", hours: 5 } },
  { label: "solo day, 1, GHS 400, daytime", inputs: { occasion: "solo_day", partySize: 1, budget: 400, startTime: "11:00", hours: 4 } },
];

async function main() {
  const { data: areaRows } = await admin.from("areas").select("id,name").order("name");
  const { data: venueRows } = await admin.from("venues").select("area_id").eq("is_active", true);
  const held = new Map<string, number>();
  for (const v of venueRows ?? []) held.set(v.area_id, (held.get(v.area_id) ?? 0) + 1);
  const areas = ((areaRows ?? []) as { id: string; name: string }[]).filter((a) => held.get(a.id));

  let tried = 0, ok = 0, rescued = 0, failed = 0;
  const thin: string[] = [];

  for (const area of areas) {
    const results: string[] = [];
    for (const req of REQUESTS) {
      const inputs = {
        ...defaultInputs(),
        ...req.inputs,
        surpriseMe: false,
        areaIds: [area.id],
        areaNames: [area.name],
        date: "2026-10-10",
      } as PlanInputs;
      tried++;
      if (planItinerary(inputs, await fetchCandidates(admin as never, inputs))) {
        ok++;
        continue;
      }
      const wider = { ...inputs, radiusKm: REACH_FALLBACK_KM };
      const plan = planItinerary(wider, await fetchCandidates(admin as never, wider));
      if (plan) {
        rescued++;
        const used = [...new Set(plan.stops.map((s) => s.venue.areas?.name ?? "?"))];
        results.push(`  rescued  ${req.label}: ${used.join(" + ")}`);
      } else {
        failed++;
        results.push(`  FAILED   ${req.label}`);
      }
    }
    if (results.length) {
      thin.push(`${area.name} (${held.get(area.id)} venues)`);
      console.log(`${area.name}, ${held.get(area.id)} active venues`);
      for (const r of results) console.log(r);
    }
  }

  console.log(`\n${tried} requests in ${areas.length} areas: ${ok} filled in the area, ${rescued} rescued by reaching ${REACH_FALLBACK_KM} km, ${failed} still failed.`);
  console.log(`Thin: ${thin.join(", ") || "none"}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
