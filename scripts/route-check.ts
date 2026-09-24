/** How often plans double back to an area already left, and how far they travel.  npm run route:check
import fs from "fs";
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
import { createClient } from "@supabase/supabase-js";
import { fetchCandidates } from "../src/lib/matching";
import { planItinerary } from "../src/lib/planner";
import { defaultInputs } from "../src/lib/planConstants";
const haversineKm = (a: {lat:number;lng:number}, b: {lat:number;lng:number}) => { const R=6371,dL=(b.lat-a.lat)*Math.PI/180,dG=(b.lng-a.lng)*Math.PI/180,h=Math.sin(dL/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dG/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
import type { PlanInputs } from "../src/lib/types";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** Returned to an area after leaving it for another: the Labone -> East Legon -> ... -> East Legon shape. */
function revisits(areas: string[]): number {
  let n = 0;
  const left = new Set<string>();
  for (let i = 1; i < areas.length; i++) {
    if (areas[i] !== areas[i - 1]) left.add(areas[i - 1]);
    if (left.has(areas[i])) n++;
  }
  return n;
}

async function main() {
  const { data: areaRows } = await admin.from("areas").select("id,name");
  const idOf = (n: string) => (areaRows as { id: string; name: string }[]).find((a) => a.name === n)!.id;
  const areaSets: { label: string; ids: string[] }[] = [
    { label: "surprise", ids: [] },
    { label: "Labone+East Legon", ids: [idOf("Labone"), idOf("East Legon")] },
    { label: "Osu+Cantonments+East Legon", ids: [idOf("Osu"), idOf("Cantonments"), idOf("East Legon")] },
  ];
  const occasions = ["date_night", "friend_outing", "birthday", "solo_day"] as const;
  const vibeSets = [["Fun"], ["Calm"], ["Foodie"], ["Lively"]];
  const shapes: Partial<PlanInputs>[] = [
    { hours: 6, stops: 4, startTime: "11:00", budget: 1500 },
    { hours: 7, stops: 5, startTime: "12:00", budget: 2500 },
    { hours: 4, stops: 3, startTime: "17:30", budget: 900 },
  ];

  let plans = 0, doubled = 0, totalKm = 0, totalFare = 0;
  const examples: string[] = [];

  for (const occasion of occasions)
    for (const areasSet of areaSets)
      for (const vibes of vibeSets)
        for (const shape of shapes) {
          const inputs = {
            ...defaultInputs(),
            occasion,
            partySize: occasion === "solo_day" ? 1 : occasion === "friend_outing" ? 4 : 2,
            vibes,
            surpriseMe: areasSet.ids.length === 0,
            areaIds: areasSet.ids,
            date: "2026-09-26",
            ...shape,
          } as PlanInputs;
          const plan = planItinerary(inputs, await fetchCandidates(admin as never, inputs));
          if (!plan) continue;
          plans++;
          const areas = plan.stops.map((st) => st.venue.areas?.name ?? "?");
          if (revisits(areas)) {
            doubled++;
            if (examples.length < 6) examples.push(`${occasion} ${areasSet.label} ${vibes}: ${areas.join(" -> ")}`);
          }
          for (let i = 1; i < plan.stops.length; i++) {
            const a = plan.stops[i - 1].venue, b = plan.stops[i].venue;
            if (a.lat != null && b.lat != null) totalKm += haversineKm({ lat: +a.lat, lng: +a.lng! }, { lat: +b.lat, lng: +b.lng! });
          }
          totalFare += plan.transportTotal;
        }

  console.log(`plans: ${plans}   doubled back: ${doubled}   km between located stops: ${totalKm.toFixed(0)}   fares: GHS ${totalFare}`);
  for (const e of examples) console.log(`   ${e}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
