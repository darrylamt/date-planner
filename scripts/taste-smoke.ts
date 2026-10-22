/**
 * A person's taste (taste.ts), checked on made-up places and dishes, then on
 * the real catalogue's vectors. npm run taste:smoke
 */
import { createClient } from "@supabase/supabase-js";
import { computeTaste, dishTaste, dishWords, TASTE } from "../src/lib/taste";

const now = Date.parse("2026-10-22T20:00:00Z");
const sig = (kind: string, venue_id: string, item: string | null = null, plan = `p${Math.random()}`, daysAgo = 0) => ({
  kind,
  venue_id,
  item,
  plan_key: plan,
  device_id: "d1",
  created_at: new Date(now - daysAgo * 864e5).toISOString(),
});
const unit = (xs: number[]) => {
  const n = Math.hypot(...xs);
  return Float32Array.from(xs.map((x) => x / n));
};

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}

// Two kinds of place: rooftop bars along one axis, chop bars along another.
const vecs = new Map<string, Float32Array>([
  ["roof1", unit([1, 0.1, 0])],
  ["roof2", unit([0.9, 0, 0.1])],
  ["roof3", unit([1, 0.05, 0.05])],
  ["chop1", unit([0, 1, 0.1])],
  ["chop2", unit([0.1, 0.9, 0])],
  ["spa", unit([0, 0, 1])],
]);

{
  const t = computeTaste([sig("saved", "roof1"), sig("saved", "roof2"), sig("swapped_away", "chop1")], vecs, now);
  const roof3 = t.places.get("roof3") ?? 0;
  const chop2 = t.places.get("chop2") ?? 0;
  check("keeps rooftops: an unseen rooftop leans up", roof3 > 0.5, `roof3 ${roof3}`);
  check("swapped a chop bar: another leans down", chop2 < -0.3, `chop2 ${chop2}`);
  check("never past the cap", [...t.places.values()].every((p) => Math.abs(p) <= TASTE.cap));
  check("unrelated places barely move", Math.abs(t.places.get("spa") ?? 0) < 0.5, `spa ${t.places.get("spa") ?? 0}`);
}

{
  const t = computeTaste([sig("saved", "roof1"), sig("saved", "roof2")], vecs, now);
  check("under three signals, no leaning", t.places.size === 0);
}

{
  const t = computeTaste(
    [sig("saved", "roof1", null, "same"), sig("saved", "roof1", null, "same"), sig("saved", "roof1", null, "same")],
    vecs,
    now
  );
  check("the same save three times is one", t.places.size === 0);
}

{
  const t = computeTaste(
    [
      sig("dish_added", "x", "Grilled Tilapia (whole)"),
      sig("dish_added", "y", "Grilled chicken wings"),
      sig("dish_removed", "x", "Vegetable fried rice"),
    ],
    vecs,
    now
  );
  check("dish words: grilled liked", (t.words.grilled ?? 0) > 0.9, JSON.stringify(t.words));
  check("dish words: fried rice disliked", (t.words.rice ?? 0) < 0);
  check("a new grilled dish scores up", dishTaste(t.words, "Grilled Lobster") > 0, `${dishTaste(t.words, "Grilled Lobster")}`);
  check("a rice dish scores down", dishTaste(t.words, "Jollof Rice") < 0, `${dishTaste(t.words, "Jollof Rice")}`);
  check("dish lean capped", Math.abs(dishTaste(t.words, "grilled grilled tilapia chicken wings")) <= TASTE.dishCap);
}

check("filler words dropped", dishWords("Large Bottle of House Red Wine (750ml)").join(" ") === "red wine", dishWords("Large Bottle of House Red Wine (750ml)").join(" "));

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await db.from("venue_embeddings").select("venue_id, embedding, venues(name)");
    const rows = (data ?? []) as unknown as { venue_id: string; embedding: number[]; venues: { name: string } | null }[];
    console.log(`\nreal: ${rows.length} venues embedded`);
    if (rows.length > 10) {
      // Centre and normalise as taste.ts does, then: who is nearest a cocktail bar?
      const dims = rows[0].embedding.length;
      const mean = new Array(dims).fill(0);
      for (const r of rows) r.embedding.forEach((x, i) => (mean[i] += x / rows.length));
      const real = new Map(rows.map((r) => [r.venue_id, unit(r.embedding.map((x, i) => x - mean[i]))]));
      const name = new Map(rows.map((r) => [r.venue_id, r.venues?.name ?? "?"]));
      const pick = rows.find((r) => /cocktail|lounge|rooftop/i.test(r.venues?.name ?? "")) ?? rows[0];
      const t = computeTaste(
        [sig("saved", pick.venue_id), sig("book_tapped", pick.venue_id, null, "q"), sig("directions_tapped", pick.venue_id, null, "r")],
        real,
        now
      );
      const top = [...t.places.entries()].sort((a, b) => b[1] - a[1]);
      console.log(`  kept ${name.get(pick.venue_id)}; nearest now:`);
      for (const [id, p] of top.slice(1, 6)) console.log(`    +${p.toFixed(2)}  ${name.get(id)}`);
      console.log(`  furthest:`);
      for (const [id, p] of top.slice(-3)) console.log(`    ${p.toFixed(2)}  ${name.get(id)}`);
    }
  }
  if (failed) {
    console.log(`\n${failed} failed`);
    process.exit(1);
  }
})();
