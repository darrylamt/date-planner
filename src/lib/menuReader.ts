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

/** Tried in order; the second when the first is over its free limit or away. 2.5 Flash is closed to new keys. */
const MODELS = ["gemini-3.8-flash", "gemini-flash-latest"];

export const MENU_READ_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

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
  unsure?: boolean;
}

export type MenuReadResult =
  | { ok: true; items: ReadItem[]; chargesNotes: string[]; deliveryApp: boolean; model: string }
  | { ok: false; reason: "no_key" | "limit" | "unreadable" | "failed"; message: string };

const PROMPT = `You are reading a restaurant, bar or activity venue's menu or price list in Accra, Ghana, to fill a database.
Return every priced item. Rules:
- price_ghs: the price in Ghana cedis as a number. Skip items with no price at all.
- One row per price. "Small 60 / Large 95" is two rows, the size added to the name ("Chicken wings (Small)"). A bottle price and a glass price are two rows; put "(Bottle)" in the bottle row's name.
- Keep the menu's own item names; fix only obvious typos. Do not translate.
- category: one of starter, main, dessert, drink, activity, other. Section headings decide it ("Small chops" is starter, "Sides" is other, games and passes are activity).
- notes: a short description the menu prints under the item, else "".
- covers_people: how many people one price serves when the menu says so ("for 2", "sharing platter for 4"), else 1.
- alcoholic: "yes" for beer, wine, spirits and cocktails, "no" for juices, soft drinks, mocktails, water, tea and coffee, "" when you cannot tell or for food.
- dietary: only the menu's own words such as "Vegan" or "Vegetarian" (a printed (V) counts), else "".
- days, from, to: only when the menu limits when a price applies, e.g. a happy hour. days like "Mon-Fri" or "weekends", times as 24-hour "16:00". Else "".
- unsure: true when the price or name was hard to read or you had to guess.
- chargesNotes: menu-wide lines about tax, VAT or service charges, word for word.
- deliveryApp: true when this is a screenshot of a delivery app (Bolt Food, Glovo, Jumia Food and the like) rather than the venue's own menu.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    deliveryApp: { type: "BOOLEAN" },
    chargesNotes: { type: "ARRAY", items: { type: "STRING" } },
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
          unsure: { type: "BOOLEAN" },
        },
        required: ["name", "category", "price_ghs"],
      },
    },
  },
  required: ["deliveryApp", "items"],
};

export async function readMenu(parts: MenuPart[]): Promise<MenuReadResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, reason: "no_key", message: "GEMINI_API_KEY is not set on the server." };

  const body = {
    contents: [
      {
        parts: [
          ...parts.map((p) =>
            "text" in p
              ? { text: `File "${p.name}":\n${p.text.slice(0, 200_000)}` }
              : { inline_data: { mime_type: p.mime, data: p.data.toString("base64") } }
          ),
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0 },
  };

  let limited = false;
  for (const model of MODELS) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(55_000),
      });
    } catch {
      continue;
    }
    // Over the free limit, or busy: the next model has its own quota.
    if (res.status === 429 || res.status === 503 || res.status === 404) {
      if (res.status === 429) limited = true;
      continue;
    }
    if (!res.ok) continue;
    const json = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } | null;
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    let out: { items?: ReadItem[]; chargesNotes?: string[]; deliveryApp?: boolean } | null = null;
    try {
      out = JSON.parse(text);
    } catch {
      out = null;
    }
    if (!out?.items) continue;
    const items = out.items
      .filter((i) => i && typeof i.name === "string" && i.name.trim() && Number.isFinite(Number(i.price_ghs)) && Number(i.price_ghs) > 0)
      .slice(0, 600)
      .map((i) => ({ ...i, name: i.name.trim().slice(0, 160), price_ghs: Math.round(Number(i.price_ghs) * 100) / 100 }));
    if (!items.length) {
      return { ok: false, reason: "unreadable", message: "No priced items could be read from that. Try a sharper, straighter photo." };
    }
    return { ok: true, items, chargesNotes: (out.chargesNotes ?? []).slice(0, 10), deliveryApp: Boolean(out.deliveryApp), model };
  }
  return limited
    ? { ok: false, reason: "limit", message: "Gemini's free daily limit is used up. It resets at midnight Pacific time (8 am in Accra)." }
    : { ok: false, reason: "failed", message: "Gemini didn't answer. Try again in a minute." };
}
