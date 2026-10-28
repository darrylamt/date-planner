/**
 * Menu photos, PDFs and untidy spreadsheets into the importer's rows, read by
 * Gemini on Google's free tier (GEMINI_API_KEY).
 *
 * Only ever the first half of an import. What comes back is turned into the
 * menu CSV and goes through the importer's own check and preview, which shows
 * every row before anything is written: a misread price is worse than no
 * price, because plans are built on it. The reader marks the rows it was not
 * sure of, and the importer says so.
 *
 * Gemini rather than Anthropic for cost: this is admin work, a few menus a
 * day, and the free tier covers it. Free-tier requests may be used by Google
 * to improve its products, which is fine for a public menu and is why
 * nothing but the menu is ever sent.
 */

export const MENU_READ_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

import { GEMINI_LIGHT_MODELS, geminiJSON } from "./gemini";

export type MenuPart = { mime: string; data: Buffer } | { text: string; name: string };

export interface ReadItem {
  name: string;
  category: string;
  price_ghs: number;
  notes?: string;
  covers_people?: number;
  alcoholic?: string;
  dietary?: string;
  days?: string;
  from?: string;
  to?: string;
  min_players?: number;
  max_players?: number;
  duration_minutes?: number;
  min_age?: number;
  requires_gear?: string;
  unsure?: boolean;
}

export type MenuReadResult =
  | { ok: true; items: ReadItem[]; chargesNotes: string[]; skipped: string[]; deliveryApp: boolean; venueName: string; model: string }
  | { ok: false; reason: "no_key" | "limit" | "unreadable" | "failed"; message: string };

/*
 * The owner's own rules for menus, worked out by hand over many imports
 * before this reader existed, so the rows match what the importer and the
 * planner expect without a second pass.
 */
const PROMPT = `You are reading a venue's menu or price list in Accra, Ghana, for a database. Return every priced item.

NEVER GUESS A PRICE. An item with no readable price ("market price", "ask staff", cut off, blurred) is left out of items and its name goes in "skipped".

name: the item's own name only. Never add the section heading ("Brunch - Pesto Brioche" is wrong, "Pesto Brioche" is right). Keep the menu's spelling; fix only obvious typos. If the same item appears in two sections at the same price, list it once; at a different price or time, give each its own row with the same name. "Small 60 / Large 95" is two rows with the size in the name, e.g. "Chicken Wings (Small)". A wine or spirit sold by the bottle has "(Bottle)" in its name.

category, exactly one of:
- main: a complete dish someone orders as their meal, including breakfast and brunch dishes (pancakes, waffles, French toast, granola, omelettes) and set meals.
- starter: a real first course (soups, salads, small plates meant to start a meal).
- dessert: a sweet course after a meal. Never breakfast dishes.
- drink: anything to drink.
- activity: games, courts, sessions, passes and classes.
- other: sides, add-ons, sauces, extras and shared sets. Never file a side or add-on as a starter or main.

price_ghs: a number in Ghana cedis, nothing else.

notes: short and plain. What a dish or set includes, separated with " / ". "Vegan" or "Vegan option" where the menu says so. "Kids menu" for kids' items. "Side" for sides, "Add-on" for add-ons. Spirits by the glass: "Single shot". Wine: "Glass" or "Bottle". Mocktails: start with "Mocktail". Never use commas; use " / ".

covers_people: how many people ONE price serves. 1 unless: "for two" is 2; a bottle of wine, prosecco or champagne is 4; a bottle of spirits is 6; a platter or family deal is the number the menu states (if it states none, give 1 and set unsure).

min_players, max_players, duration_minutes, min_age, requires_gear: only for activities, from what the list says; otherwise 0 or "".

days: day names only, e.g. "Sun", "Mon-Thu", "Fri-Sun", "Weekdays", "Weekends"; separate single days with ";" ("Mon;Wed;Fri"). Never a time.
from / to: 24-hour "HH:MM". "From 2pm" is from "14:00" and to "". "Until 7:30pm" is from "" and to "19:30".
A section's days AND hours apply to EVERY item under it, its sides and add-ons included (everything under "Sunday Brunch 10am-4pm" gets days "Sun", from "10:00", to "16:00"). No stated days or times: leave them "".

alcoholic: "yes" or "no" on every row, food included. yes: beer, wine, champagne, prosecco, spirits, liqueurs, cocktails, anything with alcohol. no: all food, soft drinks, energy drinks, juices, water, coffee, tea, smoothies, mocktails. Only a drink genuinely unclear gets "" and unsure.

dietary: the menu's own words only, such as "Vegan" or "Vegetarian" (a printed (V) counts), else "".
unsure: true when a name or price was hard to read, a time was unclear, or items look merged.
chargesNotes: menu-wide lines about tax, VAT or service charges, word for word.
deliveryApp: true when this is a screenshot of a delivery app (Bolt Food, Glovo, Jumia Food and the like) rather than the venue's own menu.
venueName: the venue's name as printed on the menu (header, logo text, footer), else "".`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    deliveryApp: { type: "BOOLEAN" },
    chargesNotes: { type: "ARRAY", items: { type: "STRING" } },
    skipped: { type: "ARRAY", items: { type: "STRING" } },
    venueName: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          category: { type: "STRING", enum: ["starter", "main", "dessert", "drink", "activity", "other"] },
          price_ghs: { type: "NUMBER" },
          notes: { type: "STRING" },
          covers_people: { type: "INTEGER" },
          alcoholic: { type: "STRING" },
          dietary: { type: "STRING" },
          days: { type: "STRING" },
          from: { type: "STRING" },
          to: { type: "STRING" },
          min_players: { type: "INTEGER" },
          max_players: { type: "INTEGER" },
          duration_minutes: { type: "INTEGER" },
          min_age: { type: "INTEGER" },
          requires_gear: { type: "STRING" },
          unsure: { type: "BOOLEAN" },
        },
        required: ["name", "category", "price_ghs"],
      },
    },
  },
  required: ["deliveryApp", "items"],
};

type ReadOut = { items?: ReadItem[]; chargesNotes?: string[]; skipped?: string[]; deliveryApp?: boolean; venueName?: string };

/**
 * One file, read on its own. Several photos in one request made one long
 * answer that often ran out of the route's minute (owner, 28 Oct 2026: "takes
 * very long"); one request each runs side by side and each answer is short.
 * The fast models first: Flash Lite reads a menu page in seconds and allows
 * 500 a day, the full Flash models think first and allow 20.
 */
async function readOne(p: MenuPart) {
  return geminiJSON<ReadOut>({
    parts: ["text" in p ? { text: `File "${p.name}":
${p.text.slice(0, 200_000)}` } : { inline: { mime: p.mime, data: p.data } }],
    prompt: PROMPT,
    schema: SCHEMA,
    models: GEMINI_LIGHT_MODELS,
    timeoutMs: 30_000,
    deadlineMs: 52_000,
  });
}

export async function readMenu(parts: MenuPart[]): Promise<MenuReadResult> {
  const reads = await Promise.all(parts.map(readOne));
  const good = reads.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
  if (!good.length) {
    const first = reads.find((r) => !r.ok) as Extract<(typeof reads)[number], { ok: false }> | undefined;
    const reason = first?.reason ?? "failed";
    return { ok: false, reason: reason === "no_key" ? "no_key" : reason, message: first?.message ?? "Gemini didn't answer. Try again in a minute." };
  }

  // Each page's dishes once: the same name at the same price on two pages is one dish.
  const seen = new Set<string>();
  const items = good
    .flatMap((r) => r.data.items ?? [])
    .filter((i) => i && typeof i.name === "string" && i.name.trim() && Number.isFinite(Number(i.price_ghs)) && Number(i.price_ghs) > 0)
    .map((i) => ({ ...i, name: i.name.trim().slice(0, 160), price_ghs: Math.round(Number(i.price_ghs) * 100) / 100 }))
    .filter((i) => {
      const key = `${i.name.toLowerCase()}|${i.price_ghs}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 600);
  if (!items.length) {
    return { ok: false, reason: "unreadable", message: "No priced items could be read from that. Try a sharper, straighter photo." };
  }
  const missed = reads.length - good.length;
  return {
    ok: true,
    items,
    chargesNotes: [...new Set(good.flatMap((r) => r.data.chargesNotes ?? []))].slice(0, 10),
    skipped: [
      ...(missed ? [`${missed} of ${reads.length} files could not be read this time: read them again on their own.`] : []),
      ...new Set(good.flatMap((r) => r.data.skipped ?? [])),
    ].slice(0, 50),
    deliveryApp: good.some((r) => r.data.deliveryApp),
    venueName: (good.map((r) => (r.data.venueName ?? "").trim()).find(Boolean) ?? "").slice(0, 120),
    model: [...new Set(good.map((r) => r.model))].join(", "),
  };
}
