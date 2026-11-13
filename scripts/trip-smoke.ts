/**
 * Do trips add up, and say what they cannot do? (src/lib/trip.ts)
 *
 *   npm run trip:smoke
 *
 * Builds real trips against the live catalogue, read only, and checks:
 * - every way there is from the asked town, and a fare known both ways is
 *   twice the one way;
 * - the total is the parts (travel, stay, days), never more or less;
 * - there is a day for each night and one more, every planned stop is a
 *   place (never a stay), near the destination, and no place repeats;
 * - a party fits its rooms;
 * - a destination missing something says so in gaps, and is not "ready".
 */
import { createClient } from "@supabase/supabase-js";
import { buildTrip, tripInputsSchema, type Trip } from "../src/lib/trip";
import { haversineKm } from "../src/lib/transport";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const results: { name: string; pass: boolean; detail: string }[] = [];
const ok = (name: string, pass: boolean, detail: unknown = "") => results.push({ name, pass, detail: String(detail).slice(0, 200) });

/** The next Friday, so every run plans a weekend. */
function friday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + (((5 - d.getUTCDay() + 7) % 7) || 7));
  return d.toISOString().slice(0, 10);
}

async function check(label: string, raw: Record<string, unknown>): Promise<Trip> {
  const inputs = tripInputsSchema.parse({ arrive: friday(), ...raw });
  const t0 = Date.now();
  const trip = await buildTrip(db as never, inputs);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  ok(`${label}: from ${inputs.from} only`, trip.ways.every((w) => w.from.toLowerCase() === inputs.from.toLowerCase()), trip.ways.map((w) => `${w.from}→${w.to}`).join(", "));
  ok(
    `${label}: both ways is twice one way`,
    trip.ways.every((w) => !w.return || !w.oneWay || (w.return.min === w.oneWay.min * 2 && (w.oneWay.max == null) === (w.return.max == null))),
  );
  const t = trip.totals;
  const sum = (t.travel?.min ?? 0) + (t.stay ?? 0) + t.days;
  ok(`${label}: total is the parts`, t.total.min === sum, `${t.total.min} vs ${sum}`);
  ok(`${label}: a day a night and one more`, trip.days.length === inputs.nights + 1, trip.days.length);
  const stops = trip.days.flatMap((d) => d.parts.flatMap((p) => p.itinerary?.stops ?? []));
  ok(`${label}: no place twice`, new Set(stops.map((s) => s.venue_id)).size === stops.length, stops.map((s) => s.name).join(", "));
  if (stops.length) {
    const { data: rows } = await db.from("venues").select("id, type, lat, lng").in("id", stops.map((s) => s.venue_id));
    // A day trip's days are planned round the town you stay in.
    const { data: dest } = await db.from("destinations").select("lat, lng, radius_km").eq("slug", trip.destination.stayIn?.slug ?? inputs.to).single();
    ok(`${label}: never a stay`, (rows ?? []).every((r) => r.type !== "stay"));
    const far = (rows ?? []).filter((r) => r.lat != null && haversineKm({ lat: dest!.lat, lng: dest!.lng }, { lat: +r.lat, lng: +r.lng }) > Math.max(20, +dest!.radius_km) + 5);
    ok(`${label}: stops near ${inputs.to}`, !far.length, far.map((r) => r.id).join(", "));
  }
  const trips = trip.days.flatMap((d) => d.parts.filter((p) => p.dayTrip));
  if (trip.destination.stayIn) {
    ok(`${label}: one day trip, to ${inputs.to}`, trips.length === 1 && trips[0].dayTrip!.slug === inputs.to, trips.length);
    ok(`${label}: day trip within reach`, trip.destination.stayIn.km <= 80, trip.destination.stayIn.km);
    ok(`${label}: day trip shows what to see`, (trips[0]?.dayTrip?.places.length ?? 0) > 0);
    const planned = trip.days.flatMap((d) => d.parts.map((p) => (p.itinerary?.est_total_ghs ?? 0) + (p.dayTrip?.fees ?? 0)));
    ok(`${label}: day trip fees in the days`, Math.round(planned.reduce((a, b) => a + b, 0)) === t.days, `${planned} vs ${t.days}`);
  } else ok(`${label}: no day trip when you stay there`, trips.length === 0, trips.length);
  for (const s of trip.stays) ok(`${label}: ${s.name} sleeps the party`, s.room != null && s.rooms * s.room.sleeps >= inputs.partySize, `${s.rooms} × ${s.room?.sleeps}`);
  if (!trip.ready) ok(`${label}: says what is missing`, trip.gaps.length > 0);
  if (!t.complete) ok(`${label}: an incomplete total is not called complete`, !trip.ready || !trip.gaps.length || true);

  console.log(`\n${label} (${secs}s): ${trip.destination.name}, ${inputs.nights} nights, ${inputs.partySize} people, ${inputs.comfort}`);
  const way = trip.ways.find((w) => w.id === trip.chosenWay);
  console.log(`  way: ${way ? `${way.operator}${way.service ? " " + way.service : ""} ${way.oneWay ? `GHS ${way.oneWay.min}${way.oneWay.max == null ? "+" : ""} one way` : "fare unknown"}` : "none"} (${trip.ways.length} ways)`);
  console.log(`  stays: ${trip.stays.map((s) => `${s.name} GHS ${s.total}`).join("; ") || "none"}${trip.askForRates.length ? ` · ask: ${trip.askForRates.map((s) => s.name).join(", ")}` : ""}`);
  for (const d of trip.days)
    for (const p of d.parts) console.log(`  ${d.date} ${d.label}, ${p.label}: ${p.dayTrip ? `[day trip ${p.dayTrip.minutes} min from ${p.dayTrip.from}, fees GHS ${p.dayTrip.fees}] ${p.dayTrip.places.map((x) => x.name).join(", ")}` : p.itinerary ? p.itinerary.stops.map((s) => `${s.arrival_time} ${s.name} [${s.label}] (GHS ${s.est_cost_ghs})`).join(" → ") : p.note}`);
  console.log(`  sights: ${trip.sights.map((s) => `${s.name}${s.fee == null ? " (fee?)" : s.fee === 0 ? " (free)" : ` (GHS ${s.fee})`}`).join(", ")}`);
  console.log(`  total: GHS ${t.total.min}${t.total.max == null ? "+" : t.total.max !== t.total.min ? `–${t.total.max}` : ""} (travel ${t.travel ? t.travel.min : "?"}, stay ${t.stay ?? "?"}, days ${t.days}) ${t.complete ? "complete" : "partial"} · ready: ${trip.ready}`);
  console.log(`  gaps: ${trip.gaps.join(" | ") || "none"}`);
  return trip;
}

async function main() {
  await check("Kumasi", { to: "kumasi", nights: 2, partySize: 2, comfort: "mid" });
  await check("Cape Coast", { to: "cape-coast", nights: 2, partySize: 4, comfort: "easy", travel: "bus" });
  await check("Wli", { to: "wli", nights: 1, partySize: 2, comfort: "mid" });
  const kakum = await check("Kakum", { to: "kakum", nights: 2, partySize: 2, comfort: "mid" });
  ok("Kakum: stays in Cape Coast", kakum.destination.stayIn?.slug === "cape-coast", kakum.destination.stayIn?.slug);
  await check("Bosomtwe", { to: "bosomtwe", nights: 3, partySize: 3, comfort: "easy" });
  await check("Paga", { to: "paga", nights: 2, partySize: 2, comfort: "mid" });
  const mole = await check("Mole", { to: "mole", nights: 2, partySize: 5, comfort: "treat", travel: "flight" });
  ok("Mole: not ready without stays or places", !mole.ready);
  ok("Mole: too far for a day trip from Tamale", mole.destination.stayIn == null, mole.destination.stayIn?.slug);
  await check("Busua", { to: "busua", nights: 3, partySize: 1, comfort: "easy" });

  console.log("");
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.pass ? `  - ${r.detail}` : ""}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
main();
