/**
 * Does "Catch a movie" put a real showing in the plan?
 *
 *   npx tsx scripts/movie-check.ts
 *
 * Plans a few evenings against the live catalogue and cinema_showtimes with
 * the movie ticked, and prints each plan's stops, so the film, its time, its
 * length and its price can be read off. Read-only.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

async function main() {
  const { fetchCandidates } = await import("../src/lib/matching");
  const { planItinerary } = await import("../src/lib/planner");
  const { planInputsSchema } = await import("../src/lib/schemas");
  const { defaultInputs } = await import("../src/lib/planConstants");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE!, {
    auth: { persistSession: false },
  });
  const { data: areas } = await db.from("areas").select("id,name");
  const area = (n: string) => areas!.find((a) => a.name === n)!;
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 2);
  const date = day.toISOString().slice(0, 10);

  const cases = [
    { label: "date night, Osu, action", occasion: "date_night", partySize: 2, budget: 600, area: "Osu", movieGenres: ["Action"] },
    { label: "friends, East Legon, any film", occasion: "friend_outing", partySize: 4, budget: 1400, area: "East Legon", movieGenres: [] },
    { label: "solo, Dzorwulu, horror", occasion: "solo_day", partySize: 1, budget: 300, area: "Dzorwulu", movieGenres: ["Horror"] },
  ];
  for (const k of cases) {
    const a = area(k.area);
    const inputs = planInputsSchema.parse({
      ...defaultInputs(),
      occasion: k.occasion,
      partySize: k.partySize,
      budget: k.budget,
      date,
      startTime: "17:00",
      hours: 6,
      areaIds: [a.id],
      areaNames: [a.name],
      movie: true,
      movieGenres: k.movieGenres,
    });
    const candidates = await fetchCandidates(db as never, inputs);
    const films = candidates.events.filter((e) => e.kind === "movie").length;
    const plan = planItinerary(inputs, candidates);
    console.log(`\n${k.label} (${date}): ${films} showings in reach, ${plan ? `GHS ${plan.total} of ${k.budget}` : "no plan"}`);
    for (const s of plan?.stops ?? []) {
      const t = `${Math.floor(s.arrivalMinutes / 60)}:${String(s.arrivalMinutes % 60).padStart(2, "0")}`;
      console.log(`  ${t} ${s.event ? `FILM ${s.event.title} at ${s.event.start_time} (${s.venue.name})` : s.venue.name}  ${s.durationMins} min  GHS ${s.cost}${s.event ? `  [${s.orders.map((o) => o.item).join(", ")}]` : ""}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
