import type { MenuItem } from "./types";

/**
 * Does a real plan's food make sense? The rules the planner keeps for an
 * intentional meal (owner, 27 Oct 2026), checked against what plans actually
 * served: every plan's dishes are on record since 0097 (plan_demand.orders),
 * with each stop's heading and arrival. /admin/meals reads them.
 *
 * The same rules as scripts/meal-smoke.ts, which builds sample plans; this
 * checks the ones people were given.
 */
export const MEAL_PROBLEMS = {
  no_drink: "Food with nothing to drink, and nothing said",
  water: "Plain water ordered",
  strong: "A spirit, shot or energy drink with a meal",
  sober: "Alcohol at a family day or business meeting",
  late_breakfast: "Breakfast after breakfast time",
  side: "A side or an extra as somebody's plate",
  same_main: "Two people, the same main",
  hot_dinner: "Hot drinks with dinner",
  two_desserts: "Dessert twice in one outing",
  repeat: "The same kind of dish at two stops",
} as const;
export type MealProblemKind = keyof typeof MEAL_PROBLEMS;

/** One stop as plan_demand.orders keeps it. */
export interface LoggedStop {
  venue_id: string;
  type?: string | null;
  label?: string;
  at?: string;
  dry?: boolean;
  items: { item: string; qty: number; ghs: number; door?: boolean; base?: boolean; estimate?: boolean }[];
}

export interface MealProblem {
  kind: MealProblemKind;
  venueId: string;
  detail: string;
}

const MEALTIMES = new Set(["BREAKFAST", "BRUNCH", "LUNCH", "DINNER"]);
const STRONG = new Set(["whisky", "vodka", "gin", "rum", "tequila", "brandy_cognac", "liqueur", "shot", "energy_drink"]);
const ALCOHOL = new Set([
  ...STRONG, "cocktail", "local_beer", "imported_beer", "craft_beer", "cider", "palm_wine",
  "red_wine", "white_wine", "rose_wine", "sparkling_wine", "champagne",
]);
const HOT = new Set(["coffee", "hot_tea", "hot_chocolate"]);
// The meat, fish or egg that makes two plates the same; "vegetarian" does not, since a pizza and a pasta can both be.
const PROTEINS = ["chicken", "beef", "goat", "lamb", "pork", "fish", "seafood", "egg"];
const PLAIN = new Set(["other", "side_starch", "bread", "vegetables"]);

const minutesOf = (clock?: string) => {
  const m = clock?.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  return ((Number(m[1]) % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]);
};
const breakfastEnds = (weekday: number | null) => (weekday === 0 || weekday === 6 ? 13 * 60 + 30 : 12 * 60);
const isDrink = (m: MenuItem) => m.category === "drink" || m.dish_role === "drink";
const isDessert = (m: MenuItem) => (m.dish_role ? m.dish_role === "dessert" : m.category === "dessert");
const signature = (m: MenuItem) => (m.dish_tags ?? []).find((t) => PROTEINS.includes(t)) ?? m.dish_type ?? m.name;

/** Every problem in one plan. `menuOf` gives a venue's menu as the planner ordered from it. */
export function checkMeals(
  stops: LoggedStop[],
  menuOf: (venueId: string) => MenuItem[],
  ctx: { occasion: string | null; party: number | null; weekday: number | null }
): MealProblem[] {
  const out: MealProblem[] = [];
  const say = (kind: MealProblemKind, venueId: string, detail: string) => out.push({ kind, venueId, detail });
  const sweet: boolean[] = [];
  const kinds: Set<string>[] = [];

  for (const st of stops) {
    const menu = menuOf(st.venue_id);
    const byName = new Map(menu.map((m) => [m.name, m]));
    const lines = st.items.filter((l) => !l.door).map((l) => ({ l, m: byName.get(l.item) }));
    const drinks = lines.filter((x) => x.m && isDrink(x.m));
    const food = lines.filter((x) => x.m && !isDrink(x.m));
    const meal = MEALTIMES.has(st.label ?? "");
    const at = minutesOf(st.at);

    sweet.push(st.type === "dessert" || food.some((x) => isDessert(x.m!)));
    kinds.push(new Set(food.map((x) => x.m!.dish_type).filter((k): k is string => Boolean(k && !PLAIN.has(k)))));

    if (st.type !== "restaurant" && st.type !== "cafe") continue;
    if (food.length && !drinks.length && !st.dry) say("no_drink", st.venue_id, food.map((x) => x.l.item).join(", "));
    for (const { l, m } of drinks) {
      const k = m!.drink_kind ?? "";
      if (k === "still_water" || k === "sparkling_water") say("water", st.venue_id, l.item);
      if (meal && STRONG.has(k)) say("strong", st.venue_id, l.item);
      if (meal && ALCOHOL.has(k) && (ctx.occasion === "family_day" || ctx.occasion === "business_meeting")) say("sober", st.venue_id, l.item);
      if (st.label === "DINNER" && HOT.has(k)) say("hot_dinner", st.venue_id, l.item);
    }
    for (const { l, m } of food) {
      if (at != null && at >= breakfastEnds(ctx.weekday) && (m!.meal_time === "breakfast" || m!.meal_time === "brunch")) {
        say("late_breakfast", st.venue_id, `${l.item} at ${st.at}`);
      }
      if (!l.base && (m!.dish_role === "side" || m!.dish_role === "addon")) say("side", st.venue_id, l.item);
    }
    const mains = food.filter((x) => x.m!.dish_role === "main");
    if (meal && (ctx.party ?? 0) >= 2 && mains.length >= 2) {
      const sigs = new Set(mains.map((x) => signature(x.m!)));
      const offered = new Set(menu.filter((m) => m.dish_role === "main").map(signature));
      if (sigs.size === 1 && offered.size > 1) say("same_main", st.venue_id, mains.map((x) => x.l.item).join(", "));
    }
  }

  stops.forEach((st, i) => {
    if (!MEALTIMES.has(st.label ?? "") || !sweet.slice(i + 1).some(Boolean)) return;
    const menu = menuOf(st.venue_id);
    const desserts = st.items.filter((l) => menu.some((m) => m.name === l.item && isDessert(m)));
    if (desserts.length) say("two_desserts", st.venue_id, desserts.map((l) => l.item).join(", "));
  });
  const seen = new Map<string, number>();
  kinds.forEach((ks, i) => {
    for (const k of ks) {
      if (seen.has(k) && seen.get(k) !== i) say("repeat", stops[i].venue_id, k.replace(/_/g, " "));
      if (!seen.has(k)) seen.set(k, i);
    }
  });
  return out;
}
