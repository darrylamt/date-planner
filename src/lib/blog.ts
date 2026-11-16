import type { SupabaseClient } from "@supabase/supabase-js";
import { geminiJSON, GEMINI_LIGHT_MODELS } from "./gemini";
import { menuPath, slugify } from "./menuPage";
import { tidyName } from "./nudges";
import { weekendPicks } from "./weekendPost";
import { lineup, rangeLabel } from "./socialPosts";
import { fetchAllRows } from "./fetchAll";

/*
 * The daily blog (owner, 16 Nov 2026): one post a day for Google, on a topic
 * that rotates through the week, written from what Duro! holds.
 *
 * The facts are ours and are put in by code: every title, name, area, price
 * and link. Gemini writes only the sentences around them, from the facts it
 * is given. A draft that mentions a number, a price or a currency is thrown
 * away rather than published, so a figure on the blog is always a figure
 * from a menu or a listing. No pictures are made: a post uses the venue's own
 * catalogue photo.
 */

export type BlogKind = "cheap-eats" | "date-night" | "spotlight" | "weekend" | "coming-up" | "cafes";

export interface BlogItem {
  heading: string;
  /** Put in by code: area, prices, dishes, dates. */
  facts: string;
  /** Written by Gemini. */
  text: string;
  /** A Duro! page: the menu page, or the site. */
  link: string | null;
  image: string | null;
  venue_id?: string;
}

export interface BlogBody {
  intro: string;
  items: BlogItem[];
  outro: string;
}

/** Mon cheap eats, Tue date night, Wed a menu spotlight, Thu this weekend, Fri coming up, Sat cafés, Sun date night. */
const BY_DAY: BlogKind[] = ["date-night", "cheap-eats", "date-night", "spotlight", "weekend", "coming-up", "cafes"];

const ghs = (n: number) => `GHS ${Math.round(n).toLocaleString("en-GB")}`;
const firstSentence = (t: string | null) => (t ? t.split(/(?<=\.)\s/)[0] : "");

type V = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  vibe_tags: string[] | null;
  image_url: string | null;
  menu_shared_from: string | null;
  price_band: string | null;
  areas: { id: string; name: string; city: string | null } | null;
};
type Dish = { venue_id: string; name: string; price_ghs: number; category: string; recommend_count: number | null };

/** Every Accra venue of these types with a priced menu, its dishes, and its pull. */
async function venuesWithMenus(db: SupabaseClient, types: string[]) {
  // Paged: a read returns at most a thousand rows.
  const data = await fetchAllRows<V>((a, b) =>
    db
      .from("venues")
      .select("id, name, type, description, vibe_tags, image_url, menu_shared_from, price_band, areas(id, name, city)")
      .eq("is_active", true)
      .in("type", types)
      .not("image_url", "is", null)
      .order("id")
      .range(a, b) as never
  );
  const venues = (data as unknown as V[]).filter((v) => (v.areas?.city ?? "Accra") === "Accra" && v.areas);
  const menuIds = [...new Set(venues.map((v) => v.menu_shared_from || v.id))];
  const dishes: Dish[] = [];
  for (let i = 0; i < menuIds.length; i += 150) {
    const ids = menuIds.slice(i, i + 150);
    const d = await fetchAllRows<Dish>((a, b) =>
      db.from("menu_items").select("id, venue_id, name, price_ghs, category, recommend_count").in("venue_id", ids).gt("price_ghs", 0).order("id").range(a, b) as never
    );
    dishes.push(...d.map((x) => ({ ...x, price_ghs: Number(x.price_ghs) })));
  }
  const pull = await fetchAllRows<{ venue_id: string; effect: number }>((a, b) => db.from("venue_pull").select("venue_id, effect").order("venue_id").range(a, b) as never);
  const pullOf = new Map(pull.map((p) => [p.venue_id, Number(p.effect) || 0]));
  const menuOf = (v: V) => dishes.filter((d) => d.venue_id === (v.menu_shared_from || v.id));
  return venues
    .map((v) => {
      const menu = menuOf(v);
      const mains = menu.filter((d) => d.category === "main").map((d) => d.price_ghs).sort((a, b) => a - b);
      const typical = mains.length >= 3 ? mains[Math.floor(mains.length / 2)] : null;
      const top = [...menu].sort((a, b) => (b.recommend_count ?? 0) - (a.recommend_count ?? 0) || Number(b.category === "main") - Number(a.category === "main")).slice(0, 3);
      return { v, menu, typical, top, pull: pullOf.get(v.id) ?? 0 };
    })
    .filter((x) => x.menu.length >= 5);
}

type Draft = { kind: BlogKind; slugBase: string; title: string; description: string; items: (Omit<BlogItem, "text"> & { brief: string })[]; topic: string };

function venueItem(x: Awaited<ReturnType<typeof venuesWithMenus>>[number]): Draft["items"][number] {
  const { v, typical, top } = x;
  const facts = [
    v.areas?.name,
    typical ? `Two mains from about ${ghs(typical * 2)}` : null,
    top.length ? top.map((d) => `${d.name} ${ghs(d.price_ghs)}`).join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    heading: tidyName(v.name),
    facts,
    link: menuPath(v.id, v.name, v.areas?.name),
    image: v.image_url,
    venue_id: v.id,
    brief: [
      `Name: ${tidyName(v.name)}`,
      `Kind: ${v.type}`,
      `Area: ${v.areas?.name ?? ""}`,
      v.description ? `About: ${v.description}` : "",
      v.vibe_tags?.length ? `Feel: ${v.vibe_tags.join(", ")}` : "",
      top.length ? `Dishes people pick: ${top.map((d) => d.name).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** The area for an area post: the one with enough places, used longest ago for this kind. */
async function pickArea(db: SupabaseClient, kind: BlogKind, pool: Awaited<ReturnType<typeof venuesWithMenus>>, min: number) {
  const byArea = new Map<string, { name: string; list: typeof pool }>();
  for (const x of pool) {
    const a = x.v.areas!;
    if (!byArea.has(a.id)) byArea.set(a.id, { name: a.name, list: [] });
    byArea.get(a.id)!.list.push(x);
  }
  const { data: recent } = await db.from("blog_posts").select("slug").like("slug", `${kind}-%`).order("published_at", { ascending: false }).limit(60);
  const used = ((recent ?? []) as { slug: string }[]).map((r) => r.slug);
  const lastUse = (name: string) => {
    const i = used.findIndex((s) => s.startsWith(`${kind}-${slugify(name)}-`));
    return i < 0 ? Infinity : i;
  };
  return [...byArea.values()]
    .filter((a) => a.list.length >= min)
    .sort((a, b) => lastUse(b.name) - lastUse(a.name) || b.list.length - a.list.length)[0] ?? null;
}

async function draftFor(db: SupabaseClient, kind: BlogKind, now: Date): Promise<Draft | null> {
  const byPull = <T extends { pull: number }>(a: T, b: T) => b.pull - a.pull;

  if (kind === "cheap-eats") {
    const pool = (await venuesWithMenus(db, ["restaurant", "cafe"])).filter((x) => x.typical != null && x.typical <= 120);
    const area = await pickArea(db, kind, pool, 3);
    if (!area) return null;
    const list = area.list.sort(byPull).slice(0, 6);
    const cap = Math.max(...list.map((x) => x.typical!));
    return {
      kind,
      slugBase: `${kind}-${slugify(area.name)}`,
      title: `Cheap eats in ${area.name}: ${list.length} places with mains under ${ghs(Math.ceil(cap / 10) * 10)}`,
      description: `Good food in ${area.name} that won't empty your wallet, with real prices from each menu.`,
      topic: `Affordable places to eat in ${area.name}, Accra, for a cheap meal out.`,
      items: list.map(venueItem),
    };
  }
  if (kind === "date-night" || kind === "cafes") {
    const types = kind === "cafes" ? ["cafe"] : ["restaurant", "lounge"];
    const pool = (await venuesWithMenus(db, types)).filter((x) => x.typical != null && (kind === "cafes" || (x.typical >= 80 && x.typical <= 450)));
    const area = await pickArea(db, kind, pool, kind === "cafes" ? 3 : 4);
    if (!area) return null;
    const list = area.list.sort(byPull).slice(0, 6);
    return kind === "cafes"
      ? {
          kind,
          slugBase: `${kind}-${slugify(area.name)}`,
          title: `Cafés in ${area.name}: ${list.length} places for coffee, brunch and a slow afternoon`,
          description: `Where to sit with a coffee or brunch in ${area.name}, with prices from each menu.`,
          topic: `Cafés in ${area.name}, Accra, for coffee, brunch, working or catching up.`,
          items: list.map(venueItem),
        }
      : {
          kind,
          slugBase: `${kind}-${slugify(area.name)}`,
          title: `Date night in ${area.name}: ${list.length} places for dinner for two`,
          description: `Where to take someone in ${area.name}, with what dinner for two costs at each, from their menus.`,
          topic: `Places for a date or dinner for two in ${area.name}, Accra.`,
          items: list.map(venueItem),
        };
  }
  if (kind === "spotlight") {
    const pool = (await venuesWithMenus(db, ["restaurant", "lounge", "cafe"])).filter((x) => x.menu.length >= 12);
    const { data: recent } = await db.from("blog_posts").select("venue_ids").eq("kind", "spotlight").order("published_at", { ascending: false }).limit(60);
    const done = new Set(((recent ?? []) as { venue_ids: string[] }[]).flatMap((r) => r.venue_ids));
    const x = pool.filter((p) => !done.has(p.v.id)).sort(byPull)[0];
    if (!x) return null;
    const cats = ["starter", "main", "dessert", "drink"];
    const items = cats
      .map((c) => {
        const ds = x.menu.filter((d) => d.category === c).sort((a, b) => (b.recommend_count ?? 0) - (a.recommend_count ?? 0)).slice(0, 4);
        if (!ds.length) return null;
        const label = { starter: "To start", main: "Mains", dessert: "Something sweet", drink: "To drink" }[c]!;
        return {
          heading: label,
          facts: ds.map((d) => `${d.name} ${ghs(d.price_ghs)}`).join(" · "),
          link: menuPath(x.v.id, x.v.name, x.v.areas?.name),
          image: null,
          brief: `Section: ${label}\nDishes: ${ds.map((d) => d.name).join(", ")}`,
        };
      })
      .filter(Boolean) as Draft["items"];
    const head = venueItem(x);
    return {
      kind,
      slugBase: `${kind}-${slugify(tidyName(x.v.name))}`,
      title: `${tidyName(x.v.name)}, ${x.v.areas?.name}: the menu and what to order`,
      description: `What's on the menu at ${tidyName(x.v.name)} in ${x.v.areas?.name}, with prices, and what people pick.`,
      topic: `A look at ${tidyName(x.v.name)} in ${x.v.areas?.name}, Accra, and its menu.\n${head.brief}`,
      items: [{ ...head, heading: `About ${tidyName(x.v.name)}` }, ...items],
    };
  }
  if (kind === "weekend") {
    const { days, picks } = await weekendPicks(db, now);
    if (!picks.length) return null;
    return {
      kind,
      slugBase: `${kind}-in-accra`,
      title: `This weekend in Accra: ${picks.length} things to do, ${rangeLabel(days[0], days[2])}`,
      description: `What's on in Accra this weekend, with prices where the listing gives them.`,
      topic: `Things to do in Accra this weekend.`,
      items: picks.map((p) => ({
        heading: p.title,
        facts: [p.where, p.when, p.price?.replace(/GH₵\s?/g, "GHS ")].filter(Boolean).join(" · "),
        link: p.kind === "place" ? p.link.replace(/^https?:\/\/[^/]+/, "") : null,
        image: p.image,
        brief: [`Name: ${p.title}`, `What: ${p.kind === "film" ? "a film at the cinema" : p.kind === "place" ? "a place to eat" : "an event"}`, p.where ? `Where: ${p.where}` : ""].filter(Boolean).join("\n"),
      })),
    };
  }
  // coming-up
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 27 * 864e5).toISOString().slice(0, 10);
  const { items } = await lineup(db, from, to, 10);
  if (items.length < 3) return null;
  return {
    kind: "coming-up",
    slugBase: "coming-up-in-accra",
    title: `Coming up in Accra: ${items.length} events over the next four weeks`,
    description: `One-off events in Accra in the coming weeks, from what Duro! lists.`,
    topic: `Upcoming one-off events in Accra over the next four weeks.`,
    items: items.map((i) => ({
      heading: i.title,
      facts: [i.first === i.last ? i.first : `${i.first} to ${i.last}`, i.where, i.price].filter(Boolean).join(" · "),
      link: null,
      image: null,
      brief: [`Name: ${i.title}`, i.where ? `Where: ${i.where}` : ""].filter(Boolean).join("\n"),
    })),
  };
}

/** No figures, prices or currency in what Gemini writes: those come only from our facts. */
const NUMBERISH = /\d|GHS|GH₵|₵|cedi|dollar|\$|percent/i;

export async function writeDailyPost(db: SupabaseClient, now = new Date(), opts: { dry?: boolean; kind?: BlogKind } = {}) {
  const day = now.toISOString().slice(0, 10);
  const { data: already } = await db.from("blog_posts").select("slug").gte("published_at", `${day}T00:00:00Z`).limit(1);
  if (!opts.dry && !opts.kind && (already ?? []).length) return { ok: false as const, reason: "already posted today" };

  const kind = opts.kind ?? BY_DAY[now.getUTCDay()];
  const draft = await draftFor(db, kind, now);
  if (!draft) return { ok: false as const, reason: `nothing to write for ${kind}` };

  const prompt = [
    "You write short posts for Duro!, an app that plans nights out in Accra, Ghana. Readers are people in Accra deciding where to go.",
    `Topic: ${draft.topic}`,
    "Write: an intro of two or three sentences; for each item, two or three sentences about it; and a one-sentence outro inviting the reader to plan a night on Duro!.",
    "Rules: use ONLY the facts given for each item. Never mention prices, numbers, times, dates, opening hours, phone numbers or ratings (the page shows those). Never name a place that is not in the list. No hype words (vibrant, nestled, hidden gem, must-visit, culinary journey). Plain, warm, specific British English. Each item's text must be about that item only.",
    "",
    ...draft.items.map((it, i) => `Item ${i + 1}:\n${it.brief}`),
  ].join("\n");

  const res = await geminiJSON<{ intro: string; items: { text: string }[]; outro: string }>({
    parts: [],
    prompt,
    models: GEMINI_LIGHT_MODELS,
    schema: {
      type: "object",
      properties: {
        intro: { type: "string" },
        items: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
        outro: { type: "string" },
      },
      required: ["intro", "items", "outro"],
    },
  });
  if (!res.ok) return { ok: false as const, reason: res.message };
  const w = res.data;
  if (w.items.length !== draft.items.length) return { ok: false as const, reason: "the draft did not cover every item" };
  const texts = [w.intro, w.outro, ...w.items.map((i) => i.text)];
  // The names we gave may hold digits ("Casa1715"), and so may the dishes we
  // listed ("Platter 1"); everything else may not.
  const listed = draft.items.flatMap((i) => i.brief.split(/\r?\n/).filter((l) => /^(Name|Dishes people pick|Dishes): /.test(l)).flatMap((l) => l.replace(/^[^:]+: /, "").split(", ")));
  const names = [...new Set([...draft.items.map((i) => i.heading), ...listed])].filter(Boolean).sort((a, b) => b.length - a.length);
  /*
   * A number that is in the facts we gave is ours ("10th Street", from a
   * venue's description). Money never is: a currency word or sign anywhere
   * fails the draft, and so does any number we did not give.
   */
  const givenNumbers = new Set(draft.items.flatMap((i) => i.brief.match(/\d+(?:st|nd|rd|th)?/gi) ?? []));
  const withoutNames = (s: string) =>
    names.reduce((acc, n) => acc.split(n).join(" "), s).replace(/\d+(?:st|nd|rd|th)?/gi, (m) => (givenNumbers.has(m) ? " " : m));
  const bad = texts.find((t) => !t?.trim() || NUMBERISH.test(withoutNames(t)));
  if (bad !== undefined) {
    const at = withoutNames(bad ?? "").search(NUMBERISH);
    const near = at < 0 ? "an empty part" : `"…${withoutNames(bad).slice(Math.max(0, at - 40), at + 20)}…"`;
    return { ok: false as const, reason: `the draft mentioned a number or price (${near}), so it was not used` };
  }

  const body: BlogBody = {
    intro: w.intro.trim(),
    items: draft.items.map(({ brief: _b, ...it }, i) => ({ ...it, text: w.items[i].text.trim() })),
    outro: w.outro.trim(),
  };
  const row = {
    slug: `${draft.slugBase}-${day}`,
    kind,
    title: draft.title,
    description: draft.description,
    body,
    venue_ids: draft.items.map((i) => i.venue_id).filter(Boolean) as string[],
    hero_image: draft.items.find((i) => i.image)?.image ?? null,
    model: res.model,
  };
  if (opts.dry) return { ok: true as const, post: row };
  const { error } = await db.from("blog_posts").insert(row);
  if (error) return { ok: false as const, reason: error.message };
  return { ok: true as const, post: row };
}
