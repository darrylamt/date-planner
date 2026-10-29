import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GEMINI_LIGHT_MODELS, geminiJSON } from "./gemini";
import { fetchAllRows } from "./fetchAll";
import { DISH_ROLES, DISH_TAGS, DISH_TYPES, DRINK_KINDS, MEAL_TIMES, dishLabels, understoodKey } from "./catalog";

/**
 * What each dish is, read by Gemini (menu_items.dish_role, meal_time and
 * drink_kind, 0096), so the planner can tell a full plate from a side, a
 * pastry from dinner, breakfast from anything else, and a cocktail from a
 * glass of water. See 0096 for what each answer means.
 *
 * Batches of about 120 dishes, each with its venue's type and kitchen for
 * context ("Special" at a shawarma spot is a wrap; at a bar it is a cocktail),
 * on the light free models (500 requests a day). A dish is read again only
 * when what Gemini was shown changes (understood_hash).
 */
// The lists live in catalog.ts, which the browser can import: the menu CSV may carry them too.
export { DISH_ROLES, DISH_TAGS, DISH_TYPES, DRINK_KINDS, MEAL_TIMES };

type Row = {
  id: string;
  venue_id: string;
  name: string;
  notes: string | null;
  category: string;
  price_ghs: number;
  understood_hash: string | null;
};

const hashOf = (r: Pick<Row, "name" | "notes" | "category">) =>
  createHash("sha1").update(understoodKey(r)).digest("hex").slice(0, 16);

const PROMPT = `You label dishes on menus from restaurants, cafes and bars in Ghana, for a planner that orders a meal for people going out.

For each line give:
- role: what it is on a table.
  "main" = a full plate somebody makes a meal of (jollof with chicken, banku and tilapia, a burger, pasta, a steak, fufu with soup, a pizza).
  "light" = a light plate, not a full meal (a salad, a sandwich, a wrap, a small bowl, soup on its own).
  "side" = only eaten with something else (plain rice, chips, fries, plantain, kenkey, bread, and fufu, banku, eba or omo tuo listed on their own without a soup or stew).
  "starter" = a first course or a sharing plate (wings, spring rolls, samosas, calamari).
  "dessert" = something sweet after a meal.
  "pastry" = baked goods with coffee (croissant, muffin, cake slice, cookie, doughnut).
  "snack" = small bites or bar food (nuts, popcorn, chips and dip, kebab sticks).
  "drink" = anything to drink.
  "addon" = an extra on something else (extra cheese, a sauce, an add-on shot, a token, a mixer).
- time: when people eat it. "breakfast" = eggs, omelettes, pancakes, porridge, English breakfast, toast and similar; "brunch" = brunch-only plates; "anytime" = everything else, including all drinks and desserts.
- type: only for food, what kind of dish: soup, salad, sandwich, burger, wrap_shawarma, pizza, pasta, rice_dish (jollof, fried rice, waakye), noodles, swallow (fufu, banku, kenkey, omo tuo, tuo zaafi, eba), stew_curry, grill (suya, kebab, grilled meat or fish), steak, seafood_plate, fried_plate, sushi, platter, wings, finger_food, bread, eggs, breakfast_plate, pancakes_waffles, pastry, cake, ice_cream, dessert_other, kids_meal, side_starch (fries, plain rice, plantain), vegetables, other. Leave it out for drinks.
- drink: only for drinks, what kind: still_water, sparkling_water, soda, malt, energy_drink, fresh_juice, bottled_juice, smoothie, milkshake, coffee, iced_coffee, hot_tea, iced_tea, hot_chocolate, local_drink (sobolo, asaana, brukina, lamugin), mocktail, cocktail, local_beer (Club, Star, Guinness Ghana), imported_beer, craft_beer, cider, palm_wine, red_wine, white_wine, rose_wine, sparkling_wine (prosecco, cava), champagne, whisky, vodka, gin, rum, tequila, brandy_cognac, liqueur, shot, other. Leave it out for food.

- tags: up to 6 that truly apply, from this list only: what is in it (chicken, beef, goat, lamb, pork, fish, seafood, egg, vegetarian, vegan), how it is cooked (grilled, fried, baked, stewed, raw, spicy), its kitchen (ghanaian, west_african, continental, italian, chinese, japanese, indian, lebanese, american, french, mexican, fusion), and what it is like (sharing = meant for two or more, kids, healthy, heavy, sweet, alcoholic, non_alcoholic, hot, cold, premium = a luxury item like lobster, wagyu or champagne). Jollof, waakye, banku, fufu, kelewele, red red and light soup are ghanaian.

Judge by what the dish is, not only by the menu's category, which is often wrong. Answer for every id given, in the same order.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          role: { type: "string", enum: [...DISH_ROLES] },
          time: { type: "string", enum: [...MEAL_TIMES] },
          type: { type: "string", enum: [...DISH_TYPES] },
          drink: { type: "string", enum: [...DRINK_KINDS] },
          tags: { type: "array", items: { type: "string", enum: [...DISH_TAGS] } },
        },
        required: ["id", "role", "time", "tags"],
      },
    },
  },
  required: ["items"],
};

type Answer = { id: string; role: string; time: string; type?: string; drink?: string; tags?: string[] };

/**
 * Read up to `limit` dishes that have not been read, or have changed since.
 * Stops early when the free quota runs out or `deadlineMs` passes.
 */
export async function understandMenus(
  db: SupabaseClient,
  {
    limit = 2000,
    batch = 120,
    deadlineMs = Infinity,
    fromEnd = false,
  }: {
    limit?: number;
    batch?: number;
    deadlineMs?: number;
    /** Work from the end of the list: a second reader meeting the first in the middle. */
    fromEnd?: boolean;
  } = {}
): Promise<{ read: number; left: number; stopped?: string }> {
  const started = Date.now();
  const [rows, { data: venues }] = await Promise.all([
    fetchAllRows<Row>(
      (from, to) =>
        db.from("menu_items").select("id, venue_id, name, notes, category, price_ghs, understood_hash").order("id").range(from, to),
      1000,
      6
    ),
    db.from("venues").select("id, type, cuisine, cuisines"),
  ]);
  const venueOf = new Map(
    ((venues ?? []) as { id: string; type: string; cuisine: string | null; cuisines: string[] | null }[]).map((v) => [v.id, v])
  );
  // Dishes and drinks only: a game of pool or a manicure is not on a menu to be read (audit, 27 Oct 2026).
  const todo = rows.filter((r) => r.category !== "activity" && r.understood_hash !== hashOf(r));
  if (fromEnd) todo.reverse();
  let read = 0;

  for (let i = 0; i < Math.min(todo.length, limit); i += batch) {
    if (Date.now() - started > deadlineMs) return { read, left: todo.length - read, stopped: "out of time" };
    const chunk = todo.slice(i, Math.min(i + batch, limit));
    const lines = chunk.map((r) => {
      const v = venueOf.get(r.venue_id);
      const where = v ? `${v.type}${v.cuisines?.length ? `, ${v.cuisines.join("/")}` : v.cuisine ? `, ${v.cuisine}` : ""}` : "venue";
      return `${r.id} | ${r.name}${r.notes ? ` (${r.notes.slice(0, 120)})` : ""} | menu says: ${r.category} | GHS ${r.price_ghs} | at a ${where}`;
    });
    /*
     * A batch that gets no answer is tried again, smaller, after a pause: one
     * timeout stopped the first full run at 1,800 of 20,000. Only the daily
     * limit ends the run.
     */
    const ask = (part: string[]) =>
      geminiJSON<{ items: Answer[] }>({
        parts: [{ text: part.join("\n") }],
        prompt: PROMPT,
        schema: SCHEMA,
        models: GEMINI_LIGHT_MODELS,
        timeoutMs: 90_000,
      });
    let res = await ask(lines);
    for (let attempt = 1; !res.ok && res.reason === "failed" && attempt <= 3; attempt++) {
      await new Promise((r) => setTimeout(r, 15_000 * attempt));
      res = await ask(lines.slice(0, Math.ceil(lines.length / (attempt + 1))));
    }
    if (!res.ok) {
      if (res.reason === "limit") return { read, left: todo.length - read, stopped: res.message };
      continue; // This batch waits for the next run; the rest carry on.
    }

    const byId = new Map(chunk.map((r) => [r.id, r]));
    const now = new Date().toISOString();
    const updates = (res.data.items ?? []).flatMap((a) => {
      const labels = byId.has(a.id) ? dishLabels(a) : null;
      return labels ? [{ id: a.id, ...labels, understood_hash: hashOf(byId.get(a.id)!), understood_at: now }] : [];
    });
    // One at a time in parallel groups: an upsert would need every not-null column.
    for (let j = 0; j < updates.length; j += 25) {
      await Promise.all(
        updates.slice(j, j + 25).map(({ id, ...fields }) => db.from("menu_items").update(fields).eq("id", id))
      );
    }
    read += updates.length;
  }
  return { read, left: Math.max(0, todo.length - read) };
}
