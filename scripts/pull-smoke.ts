/**
 * The pull's rules, checked on made-up signals, then a dry run on the real
 * ones (nothing written). npm run pull:smoke
 */
import { createClient } from "@supabase/supabase-js";
import { computePull, PULL, type Signal } from "../src/lib/pull";

const now = Date.parse("2026-10-22T20:00:00Z");
const at = (daysAgo: number) => new Date(now - daysAgo * 864e5).toISOString();
const sig = (device: string, venue: string, kind: string, plan: string | null, daysAgo = 0, value: number | null = null): Signal => ({
  device_id: device,
  venue_id: venue,
  kind,
  plan_key: plan,
  created_at: at(daysAgo),
  value,
});

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
const by = (rows: ReturnType<typeof computePull>["rows"]) => new Map(rows.map((r) => [r.venue_id, r]));

// 1. Nothing at all: no leaning, only the new-venue nudge.
{
  const { rows } = computePull([], ["a", "b"], now);
  check("no signals: only the nudge", rows.every((r) => r.effect === PULL.exploreMax && r.rate === null));
}

// 2. Kept in six plans by six people against swapped out of six (with others
//    keeping and swapping elsewhere, so the catalogue has enough to judge by).
{
  const s: Signal[] = [];
  for (let i = 0; i < 12; i++) s.push(sig(`g${i}`, "other", "saved", `g${i}`), sig(`h${i}`, "other2", "swapped_away", `h${i}`));
  for (let i = 0; i < 6; i++) {
    s.push(sig(`d${i}`, "keep", "shown", `p${i}`), sig(`d${i}`, "keep", "saved", `p${i}`));
    s.push(sig(`e${i}`, "drop", "shown", `q${i}`), sig(`e${i}`, "drop", "swapped_away", `q${i}`));
    for (let j = 0; j < 4; j++) s.push(sig(`f${i}${j}`, "fill", "shown", `r${i}${j}`));
  }
  const m = by(computePull(s, ["keep", "drop", "fill", "other", "other2"], now).rows);
  const k = m.get("keep")!, d = m.get("drop")!;
  check("kept venue leans up", k.effect > 0.75 - PULL.exploreMax + 0.5, `effect ${k.effect}`);
  check("swapped venue leans down", d.effect < 0, `effect ${d.effect}`);
  check("never past the cap", Math.abs(k.effect - PULL.exploreMax * Math.max(0, 1 - k.shown / PULL.exploreBelow)) <= PULL.cap + 1e-9);
  check("shown but untouched leans neither way", Math.abs(m.get("fill")!.rate ?? 0) === 0 && m.get("fill")!.effect <= PULL.exploreMax);
}

// 3. One person swapping the same place all evening.
{
  const s: Signal[] = [];
  for (let i = 0; i < 50; i++) s.push(sig("spammer", "v", "swapped_away", `p${i}`));
  const r = by(computePull(s, ["v"], now).rows).get("v")!;
  check("one device adds at most two swaps", r.swapped <= PULL.perDevice + 1e-9, `swapped ${r.swapped}`);
}

// 4. Opening a menu five times is one opening.
{
  const s = Array.from({ length: 5 }, () => sig("d", "v", "menu_opened", null));
  const r = by(computePull(s, ["v"], now).rows).get("v")!;
  check("repeat taps count once", r.engaged === 1, `engaged ${r.engaged}`);
}

// 5. A month ago counts half; past the window, nothing.
{
  const s = [sig("d1", "v", "saved", "p1", 30), sig("d2", "w", "saved", "p2", 0), sig("d3", "x", "saved", "p3", 120)];
  const m = by(computePull(s, ["v", "w", "x"], now).rows);
  check("a month old counts half", Math.abs(m.get("v")!.kept - 0.5) < 0.01, `kept ${m.get("v")!.kept}`);
  check("past ninety days counts nothing", m.get("x")!.kept === 0);
  check("today counts whole", m.get("w")!.kept === 1);
}

// 6. Evidence is thin: two swaps do not bury anyone.
{
  const s = [sig("d1", "v", "swapped_away", "p1"), sig("d2", "v", "swapped_away", "p2")];
  for (let i = 0; i < 20; i++) s.push(sig(`k${i}`, "o", "saved", `k${i}`), sig(`s${i}`, "o", "swapped_away", `s${i}`));
  const r = by(computePull(s, ["v", "o"], now).rows).get("v")!;
  const lean = r.effect - PULL.exploreMax;
  check("two swaps cost under a point", lean > -1, `lean ${lean.toFixed(2)}`);
}

// 7. Too little across the catalogue: nobody leans.
{
  const s = Array.from({ length: 10 }, (_, i) => sig(`d${i}`, "v", "swapped_away", `p${i}`));
  const r = by(computePull(s, ["v"], now).rows).get("v")!;
  check("under thirty in all, no leaning", r.effect === PULL.exploreMax, `effect ${r.effect}`);
}

// 8. Page visits: counted, and the middle time kept, but not scored.
{
  const s = [sig("d", "v", "venue_viewed", null, 0, 4000), sig("d", "v", "venue_viewed", null, 0, 20000), sig("e", "v", "venue_viewed", null, 0, 9000)];
  const r = by(computePull(s, ["v"], now).rows).get("v")!;
  check("visits counted, median dwell", r.views === 3 && r.dwell_ms === 9000 && r.rate === null);
}

// The real signals, dry run.
(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const [{ data: signals }, { data: venues }] = await Promise.all([
      db.from("plan_signals").select("device_id, venue_id, kind, plan_key, created_at, value").order("id").limit(5000),
      db.from("venues").select("id, name").eq("is_active", true),
    ]);
    const names = new Map(((venues ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name]));
    const { rows, average } = computePull((signals ?? []) as Signal[], [...names.keys()]);
    const kinds: Record<string, number> = {};
    for (const s of signals ?? []) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
    console.log(`\nreal: ${signals?.length ?? 0} signals`, kinds, `average keep ${average.toFixed(2)}`);
    const leaning = rows
      .map((r) => ({ ...r, lean: r.effect - PULL.exploreMax * Math.max(0, 1 - r.shown / PULL.exploreBelow) }))
      .filter((r) => Math.abs(r.lean) > 0.01)
      .sort((a, b) => b.lean - a.lean);
    for (const r of leaning) console.log(`  ${r.lean >= 0 ? "+" : ""}${r.lean.toFixed(2)}  ${names.get(r.venue_id)}  shown ${r.shown} kept ${r.kept} swapped ${r.swapped}`);
    console.log(`  ${rows.filter((r) => r.shown >= 1).length} venues shown at least once`);
  }
  if (failed) {
    console.log(`\n${failed} failed`);
    process.exit(1);
  }
})();
