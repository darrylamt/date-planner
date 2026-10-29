/**
 * Do the meals make sense? Builds real plans across occasions, times and party
 * sizes and checks every order against the rules for an intentional meal
 * (planner.ts, drinkFit; Gemini's dish labels, 0096). npm run meal:smoke
 */
import { createClient } from "@supabase/supabase-js";
import { fetchCandidates } from "../src/lib/matching";
import { planItinerary } from "../src/lib/planner";
import { defaultInputs, defaultStopsFor } from "../src/lib/planConstants";
import { planInputsSchema } from "../src/lib/schemas";
import type { MenuItem, PlanInputs } from "../src/lib/types";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const SPIRITS = new Set(["whisky", "vodka", "gin", "rum", "tequila", "brandy_cognac", "liqueur", "shot", "energy_drink"]);
const ALCOHOL = new Set([...SPIRITS, "cocktail", "local_beer", "imported_beer", "craft_beer", "cider", "palm_wine", "red_wine", "white_wine", "rose_wine", "sparkling_wine", "champagne"]);
const WATER = new Set(["still_water", "sparkling_water"]);
const MEALTIMES = ["BREAKFAST", "BRUNCH", "LUNCH", "DINNER"];

type Case = { occasion: string; time: string; party: number; budget: number; date: string; diet?: string[]; estimates?: boolean; alcohol?: "none" };
const cases: Case[] = [];
const days = ["2026-11-03", "2026-11-07"]; // a Tuesday and a Saturday
for (const occasion of ["date_night", "anniversary", "first_date", "birthday", "friend_outing", "family_day", "business_meeting", "solo_day"])
  for (const time of ["09:00", "13:00", "16:00", "19:00", "21:30"]) {
    const party = occasion === "solo_day" ? 1 : occasion === "birthday" || occasion === "friend_outing" ? 4 : occasion === "family_day" ? 5 : 2;
    cases.push({ occasion, time, party, budget: 450 * party, date: days[cases.length % 2] });
  }

/*
 * The planner's per-venue variety (planner.ts, VARIETY), seeded by the case,
 * so cases differ from each other. The shortlist keeps its own chance
 * (matching.ts), so runs still meet different places, which is the point of
 * running it often; a failure names the case and the venue to look at.
 */
const seeded = (seed: string) => (id: string) => {
  let h = 2166136261;
  for (const ch of seed + id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (((h >>> 0) % 1000) / 1000) * 2;
};

// And what people do not eat (dietMenu): every dish on these must respect it.
cases.push(
  { occasion: "date_night", time: "19:00", party: 2, budget: 900, date: "2026-11-07", diet: ["vegetarian"] },
  { occasion: "friend_outing", time: "13:00", party: 4, budget: 1800, date: "2026-11-03", diet: ["vegan"] },
  { occasion: "birthday", time: "19:00", party: 4, budget: 2000, date: "2026-11-07", diet: ["no_pork"] },
  { occasion: "anniversary", time: "19:00", party: 2, budget: 1500, date: "2026-11-03", diet: ["no_seafood", "no_beef"] }
);
// And with places that have no menu (PlanInputs.estimates): a guess only where it cannot break what they said.
cases.push(
  { occasion: "date_night", time: "19:00", party: 2, budget: 900, date: "2026-11-07", estimates: true },
  { occasion: "friend_outing", time: "21:30", party: 4, budget: 1800, date: "2026-11-03", estimates: true },
  { occasion: "first_date", time: "13:00", party: 2, budget: 1500, date: "2026-11-07", estimates: true, diet: ["vegetarian"] },
  { occasion: "birthday", time: "19:00", party: 4, budget: 2000, date: "2026-11-07", estimates: true, alcohol: "none" }
);
const MEATS = ["chicken", "beef", "goat", "lamb", "pork", "fish", "seafood"];

const menuCache = new Map<string, MenuItem[]>();
async function menuOf(venueId: string, sharedFrom: string | null): Promise<MenuItem[]> {
  const ids = [...new Set([sharedFrom || venueId, venueId])];
  const key = ids.join(",");
  if (!menuCache.has(key)) {
    const { data } = await db.from("menu_items").select("*").in("venue_id", ids).limit(2000);
    menuCache.set(key, (data ?? []) as MenuItem[]);
  }
  return menuCache.get(key)!;
}

const breakfastEnds = (day: number) => (day === 0 || day === 6 ? 13 * 60 + 30 : 12 * 60);
const minutesOf = (clock: string) => {
  const m = clock.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
};

let checks = 0;
const problems: string[] = [];
const fail = (where: string, what: string) => problems.push(`${where}: ${what}`);
// Cases that built no plan at all: said, not counted, since a late start can rightly have nothing open.
const none: string[] = [];

(async () => {
  let plans = 0;
  for (const c of cases) {
    const inputs = planInputsSchema.parse({
      ...defaultInputs(),
      occasion: c.occasion,
      date: c.date,
      startTime: c.time,
      surpriseMe: true,
      budget: c.budget,
      partySize: c.party,
      ...(c.diet ? { diet: c.diet } : {}),
      ...(c.estimates ? { estimates: true } : {}),
      ...(c.alcohol ? { alcohol: c.alcohol } : {}),
      // As the app sends it: a meeting is one place (defaultStopsFor).
      stops: defaultStopsFor(c.occasion as PlanInputs["occasion"]) || undefined,
    }) as PlanInputs;
    const cands = await fetchCandidates(db as never, inputs);
    const label = `${c.occasion} ${c.time} x${c.party}${c.diet ? ` ${c.diet.join("+")}` : ""}${c.estimates ? " estimates" : ""}${c.alcohol ? " dry" : ""}`;
    const plan = planItinerary(inputs, cands, { variety: seeded(label) }) as any;
    if (!plan?.stops?.length) {
      none.push(label);
      continue;
    }
    plans++;
    const day = new Date(`${c.date}T12:00:00Z`).getUTCDay();
    // Which stops have a dessert course: a dessert place, or a dessert ordered anywhere.
    const sweetAt: boolean[] = [];
    for (const st of plan.stops) {
      const menu = await menuOf(st.venue.id, st.venue.menu_shared_from ?? null);
      const sweets = new Set(menu.filter((m) => (m.dish_role ? m.dish_role === "dessert" : m.category === "dessert")).map((m) => m.name));
      sweetAt.push(st.venue.type === "dessert" || st.orders.some((o: { item: string }) => sweets.has(o.item)));
    }

    // 10. No dessert before the meal; 11. no dessert stop after half eleven at night.
    const mealAt = plan.stops.findIndex((s: any) => s.role === "meal");
    for (let i = 0; i < plan.stops.length; i++) {
      const st = plan.stops[i];
      if (mealAt > i && sweetAt[i]) {
        checks++;
        fail(`${label} · ${st.label} @ ${st.venue.name}`, "dessert before the meal");
      }
      if (st.venue.type === "dessert" && (st.arrivalMinutes ?? 0) >= 23 * 60 + 30) {
        checks++;
        fail(`${label} · ${st.label} @ ${st.venue.name}`, `dessert at ${Math.floor(st.arrivalMinutes / 60) % 24}:${String(st.arrivalMinutes % 60).padStart(2, "0")}`);
      }
    }

    for (let i = 0; i < plan.stops.length; i++) {
      const st = plan.stops[i];
      const v = st.venue;
      /*
       * 12. A guess, where we hold no menu (PlanInputs.estimates): only when
       * asked for, only at a place with no menu, budgeted at the top of its
       * range, never a bar's for somebody not drinking, never a place to eat
       * for a vegetarian unless somebody checked it has options.
       */
      const guesses = (st.orders as { item: string; qty: number; price_ghs: number; estimate?: { low: number; high: number } }[]).filter((o) => o.estimate);
      if (guesses.length || v.estimate) {
        checks++;
        const where = `${label} · ${st.label} @ ${v.name} (${v.type})`;
        const menu = await menuOf(v.id, v.menu_shared_from ?? null);
        if (!c.estimates) fail(where, "an estimate in a plan that did not ask for places without menus");
        if (menu.length) fail(where, "an estimate at a place with a menu");
        for (const o of guesses)
          if (o.price_ghs !== o.estimate!.high * o.qty || !/^No menu yet/.test(o.item)) fail(where, `estimate line wrong: ${o.item} x${o.qty} = ${o.price_ghs}`);
        if (v.type === "lounge" && c.alcohol === "none") fail(where, "a bar's drinks guessed for somebody not drinking");
        if (c.diet?.includes("vegetarian") && v.type !== "lounge" && v.has_vegetarian_options !== true) fail(where, "a place to eat guessed for a vegetarian, unchecked");
        if (plan.confidence.exact) fail(where, "an estimate in a total said to be exact");
      }
      // 0. A meal has something to eat in it, wherever it is had: not a lounge's drinks or a club's door.
      if (st.role === "meal" && !st.event) {
        checks++;
        const menu = await menuOf(v.id, v.menu_shared_from ?? null);
        const eats = (st.orders as { item: string; door?: boolean; estimate?: unknown }[]).some((o) => {
          // No menu yet, at an estimate (PlanInputs.estimates): a meal only at a restaurant or a café.
          if (o.estimate) return v.type === "restaurant" || v.type === "cafe";
          const m = menu.find((x) => x.name === o.item);
          return !o.door && m != null && m.dish_role !== "drink" && m.category !== "drink";
        });
        if (!eats) fail(`${label} · ${st.label} @ ${v.name} (${v.type})`, `a meal with nothing to eat (${st.orders.map((o: { item: string }) => o.item).join(", ")})`);
      }
      if (v.type !== "restaurant" && v.type !== "cafe") continue;
      const menu = await menuOf(v.id, v.menu_shared_from ?? null);
      const byName = new Map(menu.map((m) => [m.name, m]));
      const lines = (st.orders as { item: string; qty: number; note?: string | null }[]).map((o) => ({ o, m: byName.get(o.item) }));
      const at = st.arrival_minutes ?? st.arrivalMinutes ?? 0;
      const where = `${label} · ${st.label} @ ${v.name}`;
      const isMeal = st.role === "meal";
      const drinks = lines.filter((l) => l.m?.dish_role === "drink" || l.m?.category === "drink");
      const food = lines.filter((l) => l.m && l.m.dish_role !== "drink" && l.m.category !== "drink");

      // 1. Something to drink with food, or the plate says to allow for one (none on file suits).
      checks++;
      const allowed = lines.some((l) => /allow extra for drinks/.test(l.o.note ?? ""));
      if (food.length && !drinks.length && !allowed) fail(where, "food with nothing to drink, and nothing said");
      // 2. Not plain water when anything else is on the menu.
      for (const d of drinks) {
        checks++;
        if (d.m?.drink_kind && WATER.has(d.m.drink_kind)) fail(where, `ordered water (${d.o.item})`);
      }
      // 3. At a meal: no neat spirits, shots or energy drinks; no alcohol on a family day or at a business meeting.
      if (isMeal)
        for (const d of drinks) {
          checks++;
          const k = d.m?.drink_kind ?? "";
          if (SPIRITS.has(k)) fail(where, `${k} with a meal (${d.o.item})`);
          if ((c.occasion === "family_day" || c.occasion === "business_meeting") && ALCOHOL.has(k)) fail(where, `alcohol at a ${c.occasion} (${d.o.item})`);
        }
      // 4. No breakfast after breakfast; no sides or add-ons as somebody's plate.
      for (const f of food) {
        checks++;
        if (at >= breakfastEnds(day) && (f.m!.meal_time === "breakfast" || f.m!.meal_time === "brunch")) fail(where, `breakfast at ${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")} (${f.o.item})`);
        const base = /To eat with/.test(f.o.note ?? "");
        if (!base && (f.m!.dish_role === "side" || f.m!.dish_role === "addon")) fail(where, `a ${f.m!.dish_role} as a plate (${f.o.item})`);
      }
      // 5. Two people, two different mains, where the menu offers different ones.
      const mains = food.filter((f) => f.m!.dish_role === "main");
      if (isMeal && c.party >= 2 && mains.length >= 2) {
        checks++;
        const sig = (m: MenuItem) => (m.dish_tags ?? []).find((t) => ["chicken", "beef", "goat", "lamb", "pork", "fish", "seafood", "egg"].includes(t)) ?? m.dish_type ?? m.name;
        const sigs = mains.map((f) => sig(f.m!));
        const menuSigs = new Set(menu.filter((m) => m.dish_role === "main").map(sig));
        if (new Set(sigs).size === 1 && menuSigs.size > 1) fail(where, `same main twice (${mains.map((f) => f.o.item).join(", ")})`);
      }
      // 6. A starter is shared: no more than one for every three people.
      const starters = food.filter((f) => f.m!.dish_role === "starter");
      // Only beside mains: where a menu has no main for them (a vegan table), starters are the plates.
      if (isMeal && starters.length && mains.length) {
        checks++;
        const n = starters.reduce((s, f) => s + f.o.qty, 0);
        if (c.party > 1 && n > Math.ceil(c.party / 3)) fail(where, `${n} starters for ${c.party}`);
      }
      // 7. One dessert an evening: none at a meal when a later stop has dessert.
      if (isMeal && sweetAt.slice(i + 1).some(Boolean)) {
        checks++;
        const desserts = food.filter((f) => f.m!.dish_role === "dessert");
        if (desserts.length) fail(where, `dessert at the meal and again later (${desserts.map((f) => f.o.item).join(", ")})`);
      }
      // 9. What they do not eat: no plate that has it, by Gemini's tags.
      if (c.diet) {
        for (const f of food) {
          checks++;
          const tags = f.m!.dish_tags ?? [];
          const bad =
            ((c.diet.includes("vegetarian") || c.diet.includes("vegan")) && MEATS.some((t) => tags.includes(t))) ||
            (c.diet.includes("vegan") && tags.includes("egg")) ||
            (c.diet.includes("no_pork") && tags.includes("pork")) ||
            (c.diet.includes("no_beef") && tags.includes("beef")) ||
            (c.diet.includes("no_seafood") && (tags.includes("fish") || tags.includes("seafood")));
          if (bad) fail(where, `${c.diet.join("+")} but ordered ${f.o.item} (${tags.join(",")})`);
        }
      }
      // 8. A meal is named for when they sit down: no lunch called dinner.
      if (isMeal && MEALTIMES.includes(st.label)) {
        checks++;
        const h = at % 1440;
        const want = h < 4 * 60 || h >= 16 * 60 + 30 ? "DINNER" : h < 11 * 60 ? "BREAKFAST" : h < 12 * 60 + 30 ? "BRUNCH" : "LUNCH";
        if (st.label !== want) fail(where, `called ${st.label} at ${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")}`);
      }
    }
  }
  console.log(`${plans} plans, ${checks} checks, ${problems.length} problems`);
  if (none.length) console.log(`  no plan: ${none.join("; ")}`);
  for (const p of problems.slice(0, 40)) console.log(`  FAIL ${p}`);
  if (problems.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
