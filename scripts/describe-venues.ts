/**
 * A one-line description for every active venue that has none, written by
 * Gemini from what the catalogue already holds and nothing else (owner,
 * 10 Nov 2026: fill the catalogue to over 90%).
 *
 *   npx tsx --env-file=.env.local scripts/describe-venues.ts --dry   # print, write nothing
 *   npx tsx --env-file=.env.local scripts/describe-venues.ts         # write blanks only
 *
 * What it is given, per venue: name, type, area and town, kitchen, vibe
 * words, Google's own one-line summary (scripts/data/places-facts.json, from
 * places-facts.ts), what the venue study found (features, signature dishes)
 * and a few dish names from its menu.
 *
 * What it must not do: invent. A venue it cannot describe from those facts
 * comes back null and stays blank, for a person. It never overwrites a
 * description somebody wrote. The voice matches the catalogue's: one plain
 * sentence of what the place is, where, and what it offers, about 100
 * characters, no superlatives.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { fetchAllRows } from "../src/lib/fetchAll";
import { geminiJSON, GEMINI_LIGHT_MODELS } from "../src/lib/gemini";

const dry = process.argv.includes("--dry");
const BATCH = 10;

type Row = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  cuisine: string | null;
  cuisines: string[] | null;
  vibe_tags: string[] | null;
  areas: { name: string; city: string } | null;
};

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const facts: Record<string, { summary: string | null; website: string | null }> = existsSync("scripts/data/places-facts.json")
    ? JSON.parse(readFileSync("scripts/data/places-facts.json", "utf8"))
    : {};
  const venues = (
    await fetchAllRows<Row>((a, b) =>
      db.from("venues").select("id, name, type, description, cuisine, cuisines, vibe_tags, areas(name, city)").eq("is_active", true).order("id").range(a, b) as never
    )
  ).filter((v) => !v.description || v.description.trim().length <= 40);
  console.log(`${venues.length} venues without a description`);

  const ids = venues.map((v) => v.id);
  const [{ data: insights }, menus] = await Promise.all([
    db.from("venue_insights").select("venue_id, features, signature_dishes").in("venue_id", ids),
    fetchAllRows<{ venue_id: string; name: string; category: string }>((a, b) =>
      db.from("menu_items").select("venue_id, name, category").in("venue_id", ids).order("id").range(a, b) as never
    ),
  ]);
  const insightOf = new Map(((insights ?? []) as { venue_id: string; features: unknown; signature_dishes: unknown }[]).map((i) => [i.venue_id, i]));
  const dishesOf = new Map<string, string[]>();
  for (const m of menus) if (m.category === "main" || m.category === "starter") dishesOf.set(m.venue_id, [...(dishesOf.get(m.venue_id) ?? []), m.name].slice(0, 8));

  let written = 0, skipped = 0;
  /*
   * The venue's own homepage, as text: what it says it offers is the best
   * fact there is about it. A site that will not answer in ten seconds, or
   * answers with an app shell, simply adds nothing.
   */
  const homepage = async (url: string | null | undefined): Promise<string | null> => {
    if (!url || /facebook\.com|instagram\.com|linktr\.ee|wa\.me/i.test(url)) return null;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "follow" });
      const html = await r.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&amp;|&#\d+;|&[a-z]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return text.length > 80 ? text.slice(0, 1800) : null;
    } catch {
      return null;
    }
  };

  /*
   * --reviews: what visitors wrote on Google, for venues with no summary and
   * no website of their own to go on. Facts only are taken from them (what is
   * served, what is there), never opinions, and never a quote.
   */
  const withReviews = process.argv.includes("--reviews");
  const { data: placeIds } = await db.from("venues").select("id, google_place_id").in("id", venues.map((v) => v.id));
  const placeOf = new Map(((placeIds ?? []) as { id: string; google_place_id: string | null }[]).map((r) => [r.id, r.google_place_id]));
  const reviewsOf = async (id: string): Promise<string[] | null> => {
    const place = placeOf.get(id);
    if (!withReviews || !place) return null;
    try {
      const r = await fetch(`https://places.googleapis.com/v1/places/${place}`, {
        headers: { "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!, "X-Goog-FieldMask": "reviews,primaryTypeDisplayName" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) return null;
      const p = (await r.json()) as { reviews?: { text?: { text?: string } }[]; primaryTypeDisplayName?: { text?: string } };
      const texts = (p.reviews ?? []).map((x) => x.text?.text ?? "").filter((t) => t.length > 20).map((t) => t.slice(0, 400));
      return [`Google lists it as: ${p.primaryTypeDisplayName?.text ?? "unknown"}`, ...texts];
    } catch {
      return null;
    }
  };

  for (let i = 0; i < venues.length; i += BATCH) {
    const batch = venues.slice(i, i + BATCH);
    const pages = await Promise.all(batch.map((v) => homepage(facts[v.id]?.website)));
    const reviews = await Promise.all(batch.map((v, k) => (!facts[v.id]?.summary && !pages[k] ? reviewsOf(v.id) : Promise.resolve(null))));
    const input = batch.map((v, k) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      // The area alone: some areas outside Accra are filed under it (Aburi), and "Aburi, Accra" is wrong.
      where: v.areas?.name ?? null,
      kitchen: [v.cuisine, ...(v.cuisines ?? [])].filter((x) => x && x !== "either").join(", ") || null,
      vibe: v.vibe_tags ?? [],
      google_summary: facts[v.id]?.summary ?? null,
      features: insightOf.get(v.id)?.features ?? null,
      signature: insightOf.get(v.id)?.signature_dishes ?? null,
      some_dishes: dishesOf.get(v.id) ?? [],
      own_website_text: pages[k],
      visitor_reviews: reviews[k],
    }));
    const res = await geminiJSON<{ venues: { id: string; description: string | null }[] }>({
      parts: [{ text: JSON.stringify(input) }],
      prompt: `These are venues in Ghana from a date and outing planner's catalogue. Write each one a description for its listing.

Rules:
- One plain sentence, 70 to 130 characters. Say what the place is, where (the area given), and what it offers.
- It must name at least one concrete thing the place offers: a kind of food or drink, a dish, a feature (pool, rooftop, padel court, live band), or an activity. Mood words alone ("calm", "casual vibe", "lively setting") are not enough; if mood words are all the facts give, return null.
- Never call a place "an activity venue" or "an activity spot": say what the activity is, or return null.
- Use ONLY the facts given for that venue: its Google summary, its own website text, visitor reviews, features, dishes. Never add a feature, dish, view, price, award or claim that is not in them. Ignore website text that is clearly a template, a cookie notice, or about something else.
- From visitor reviews take only facts several of them agree on or that are plainly factual (what is served, what is there: "a pool", "jollof and grilled tilapia", "live band on Fridays"). Never opinions ("great service", "the best"), never one person's complaint, never a quote.
- No superlatives or marketing words ("best", "amazing", "premier", "must-visit", "hidden gem"). No exclamation marks. British spelling.
- If the facts are too thin to say anything true beyond the name and type, return null for that venue.
- Return every id you were given, once.

Examples of the voice:
"A bar and pub on Lokko Street with food, drinks and a casual nightlife setting."
"Leisure club on Anorhor Street with a padel court, gym, pool and steam room. Courts are booked by the hour."
"A café serving breakfast, pastries, pancakes, wings and other casual meals, with outdoor seating and takeaway."`,
      schema: {
        type: "object",
        properties: {
          venues: {
            type: "array",
            items: { type: "object", properties: { id: { type: "string" }, description: { type: "string", nullable: true } }, required: ["id", "description"] },
          },
        },
        required: ["venues"],
      },
      models: GEMINI_LIGHT_MODELS,
    });
    if (!res.ok) {
      console.log(`  batch ${i / BATCH + 1}: ${res.message}`);
      if (res.reason === "limit") break;
      continue;
    }
    for (const out of res.data.venues) {
      const v = batch.find((b) => b.id === out.id);
      const text = out.description?.trim();
      if (!v) continue;
      if (!text || text.length < 40 || text.length > 220 || /!|\b(best|amazing|premier|must-visit|hidden gem)\b/i.test(text) || /\b(vibe|vibes|activity venue|activity spot)\b/i.test(text)) {
        skipped++;
        continue;
      }
      console.log(`  ${v.name}: ${text}`);
      if (!dry) {
        // Only over a blank, checked again at write time.
        const { error } = await db.from("venues").update({ description: text }).eq("id", v.id).or("description.is.null,description.eq.");
        if (error) console.log(`    write failed: ${error.message}`);
        else written++;
      }
    }
  }
  console.log(`${dry ? "would write" : "wrote"} ${dry ? venues.length - skipped : written}; ${skipped} left blank for a person`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
