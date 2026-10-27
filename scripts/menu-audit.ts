/**
 * How well Gemini has labelled the menus (0096): counts, and the labels that
 * look wrong by simple rules, for a person to read. npm run menu:audit
 */
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../src/lib/fetchAll";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type R = {
  name: string;
  category: string;
  price_ghs: number;
  dish_role: string | null;
  meal_time: string | null;
  dish_type: string | null;
  drink_kind: string | null;
  dish_tags: string[] | null;
};

const count = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);

(async () => {
  const rows = await fetchAllRows<R>(
    (a, b) =>
      db
        .from("menu_items")
        .select("name, category, price_ghs, dish_role, meal_time, dish_type, drink_kind, dish_tags")
        .not("understood_hash", "is", null)
        .order("id")
        .range(a, b),
    1000,
    4
  );
  console.log(`labelled: ${rows.length}`);
  console.log("roles:", count(rows.map((r) => r.dish_role ?? "?")).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("times:", count(rows.map((r) => r.meal_time ?? "?")).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("top drink kinds:", count(rows.filter((r) => r.drink_kind).map((r) => r.drink_kind!)).slice(0, 14).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("top dish types:", count(rows.filter((r) => r.dish_type).map((r) => r.dish_type!)).slice(0, 14).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("no tags:", rows.filter((r) => !r.dish_tags?.length).length);

  // The menu's own category against Gemini's role: where they disagree is where to look.
  const flags: [string, (r: R) => boolean][] = [
    ["menu says drink, Gemini says food", (r) => r.category === "drink" && r.dish_role !== "drink"],
    ["Gemini says drink, menu says food", (r) => r.category !== "drink" && r.dish_role === "drink"],
    ["drink with no drink kind", (r) => r.dish_role === "drink" && !r.drink_kind],
    ["food with a drink kind", (r) => r.dish_role !== "drink" && Boolean(r.drink_kind)],
    ["breakfast but not breakfast-sounding", (r) => r.meal_time === "breakfast" && !/egg|omelet|pancake|waffle|toast|porridge|oat|granola|breakfast|bacon|sausage|croissant|bagel|muffin|crepe|benedict|hash|bread|tea|coffee|cereal|yoghurt|yogurt|koko|hausa|beans/i.test(r.name)],
    ["Ghanaian staple called a side", (r) => r.dish_role === "side" && /jollof|waakye|fufu|banku|kenkey|red red|omo tuo|tuo zaafi|ampesi/i.test(r.name) && Number(r.price_ghs) >= 60],
    ["main under GHS 25", (r) => r.dish_role === "main" && Number(r.price_ghs) < 25],
    ["water called something else", (r) => /\bwater\b/i.test(r.name) && !/coconut|melon|tonic/i.test(r.name) && r.dish_role === "drink" && !/water/.test(r.drink_kind ?? "")],
    ["cocktail-sounding, not cocktail", (r) => /mojito|margarita|martini|daiquiri|negroni|pi[nñ]a colada|long island|cosmopolitan/i.test(r.name) && !/virgin|mocktail/i.test(r.name) && r.drink_kind !== "cocktail"],
  ];
  for (const [label, test] of flags) {
    const hits = rows.filter(test);
    console.log(`\n${label}: ${hits.length}`);
    for (const r of hits.slice(0, 6))
      console.log(`  ${r.name} [menu ${r.category}, GHS ${r.price_ghs}] → ${r.dish_role}/${r.meal_time} ${r.dish_type ?? r.drink_kind ?? ""} {${(r.dish_tags ?? []).join(",")}}`);
  }
})();
