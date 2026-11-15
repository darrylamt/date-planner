import type { SupabaseClient } from "@supabase/supabase-js";
import { tidyName } from "./nudges";
import { menuUrl } from "./menuPage";
import type { WeekendPick } from "./weekendPost";
import type { FlyerFormat, FlyerRow, FlyerSection, FlyerSpec, FlyerTheme } from "./flyer";

/*
 * What the social team posts (owner, 15 Nov 2026): the weekend post, and
 * lineups of what is on over the coming weeks, each as a flyer spec and a
 * caption. Only events Duro! holds, and only one-offs: a weekly night is not
 * news in a lineup.
 */

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const shortDate = (iso: string) => at(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const addDays = (iso: string, n: number) => new Date(at(iso).getTime() + n * 864e5).toISOString().slice(0, 10);

export interface LineupItem {
  title: string;
  first: string;
  last: string;
  where: string | null;
  price: string | null;
  eventId: string;
}

/**
 * One-off events from `from` to `to`, first date first. An event is one-off
 * when its dates run without a gap (a two-day festival counts), looked at a
 * month either side so a weekly night is seen for what it is. At most `max`,
 * preferring ones with a place, a price and a picture.
 */
export async function lineup(db: SupabaseClient, from: string, to: string, max = 16): Promise<{ items: LineupItem[]; total: number }> {
  const { data } = await db
    .from("events")
    .select("id, title, event_date, cost_ghs, image_url, audience, venue_id, venues(name, areas(name)), areas(name)")
    .eq("is_active", true)
    .gte("event_date", addDays(from, -28))
    .lte("event_date", addDays(to, 28))
    .order("event_date")
    .limit(5000);
  type E = { id: string; title: string; event_date: string; cost_ghs: number | null; image_url: string | null; audience: string | null; venue_id: string | null; venues: { name: string; areas: { name: string } | null } | null; areas: { name: string } | null };
  const byTitle = new Map<string, E[]>();
  for (const e of (data ?? []) as unknown as E[]) {
    if (e.audience && e.audience !== "everyone") continue;
    const key = e.title.trim().toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) ?? []), e]);
  }
  const items: (LineupItem & { score: number })[] = [];
  for (const runs of byTitle.values()) {
    const dates = [...new Set(runs.map((r) => r.event_date))].sort();
    const gapless = dates.every((d, i) => i === 0 || d === addDays(dates[i - 1], 1));
    if (!gapless || dates[0] < from || dates[0] > to) continue;
    const e = runs[0];
    const price = e.cost_ghs == null ? null : Number(e.cost_ghs) === 0 ? "Free" : `GHS ${Math.round(Number(e.cost_ghs))}`;
    items.push({
      title: tidyName(e.title),
      first: dates[0],
      last: dates[dates.length - 1],
      where: [e.venues?.name ? tidyName(e.venues.name) : null, e.venues?.areas?.name ?? e.areas?.name ?? null].filter(Boolean).join(", ") || null,
      price,
      eventId: e.id,
      score: (e.venue_id ? 1 : 0) + (price ? 1 : 0) + (e.image_url ? 1 : 0),
    });
  }
  const total = items.length;
  const kept = [...items].sort((a, b) => b.score - a.score || a.first.localeCompare(b.first)).slice(0, max);
  return { items: kept.sort((a, b) => a.first.localeCompare(b.first) || a.title.localeCompare(b.title)).map(({ score: _s, ...i }) => i), total };
}

/** "26–27 Dec" and "Sat–Sun" for a run of days; "20 Nov" and "Fri" for one. */
function datesOf(first: string, last: string): { date: string; day: string } {
  if (first === last) return { date: shortDate(first), day: DAY[at(first).getUTCDay()] };
  const a = at(first);
  const b = at(last);
  const date = a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${shortDate(last)}` : `${shortDate(first)}–${shortDate(last)}`;
  return { date, day: `${DAY[a.getUTCDay()]}–${DAY[b.getUTCDay()]}` };
}

export function lineupSections(items: LineupItem[]): FlyerSection[] {
  const sections: FlyerSection[] = [];
  for (const it of items) {
    const heading = MONTH[at(it.first).getUTCMonth()];
    let s = sections.find((x) => x.heading === heading);
    if (!s) sections.push((s = { heading, rows: [] }));
    const { date, day } = datesOf(it.first, it.last);
    s.rows.push({ date, title: it.title, day, sub: [it.where, it.price].filter(Boolean).join(" · ") || undefined });
  }
  // One month needs no heading.
  if (sections.length === 1) sections[0].heading = undefined;
  return sections;
}

/** "Nov – Dec 2026", "December 2026". */
export function rangeLabel(from: string, to: string): string {
  const a = at(from);
  const b = at(to);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${MONTH[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  return `${MONTH[a.getUTCMonth()].slice(0, 3)} – ${MONTH[b.getUTCMonth()].slice(0, 3)} ${b.getUTCFullYear()}`;
}

export function lineupCaption(title: string, from: string, to: string, items: LineupItem[]): string {
  return [
    `${title} ${rangeLabel(from, to)}.`,
    "",
    ...items.map((i) => `${datesOf(i.first, i.last).date}: ${i.title}${i.where ? `, ${i.where}` : ""}`),
    "",
    "Plan the whole night around any of these, with real menu prices and the ride there: link in bio.",
    "",
    "#Accra #ThingsToDoInAccra #AccraNightlife #DettyDecember #Ghana #DuroPlans",
  ].join("\n");
}

/** The weekend post's cover as a list flyer: a line per pick. */
export function weekendSpec(days: string[], picks: WeekendPick[], theme: FlyerTheme = "rose", format: FlyerFormat = "post"): FlyerSpec {
  // Events in date order first, then the film and the places.
  const ordered = [...picks].sort((a, b) => (a.iso ?? "9").localeCompare(b.iso ?? "9"));
  const rows: FlyerRow[] = ordered.map((p) => {
    const sub = [p.where, p.kind === "event" ? p.when.split(", ")[1] : p.when, p.price].filter(Boolean).join(" · ");
    if (p.kind === "event" && p.iso) return { date: shortDate(p.iso), title: p.title, day: DAY[at(p.iso).getUTCDay()], sub };
    return { date: p.kind === "film" ? "Showing" : "Any night", title: p.title, sub: [p.where, p.price].filter(Boolean).join(" · ") };
  });
  return {
    layout: "list",
    theme,
    format,
    eyebrow: `${shortDate(days[0])} – ${shortDate(days[2])}`,
    title: "This weekend",
    title2: "in Accra.",
    sections: [{ rows }],
    cta: "Plan it on the Duro! app",
  };
}

/*
 * Quick flyers (owner, 15 Nov 2026): pick a place or an event and a kind of
 * post, and the flyer and its caption come filled in from what Duro! holds.
 * The caption tags the place's Instagram, so the place can share it.
 */
export type QuickType = "spotlight" | "menu" | "datenight" | "poster" | "savedate";
export const QUICK_TYPES: Record<"venue" | "event", { id: QuickType; label: string }[]> = {
  venue: [
    { id: "spotlight", label: "Place spotlight" },
    { id: "menu", label: "Menu with prices" },
    { id: "datenight", label: "Date night idea" },
  ],
  event: [
    { id: "poster", label: "Event poster" },
    { id: "savedate", label: "Save the date" },
  ],
};

const LONG_DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const time12 = (t: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
const tag = (handle: string | null | undefined) => (handle ? ` @${handle.replace(/^@/, "")}` : "");
const firstSentence = (t: string | null) => (t ? t.split(/(?<=\.)\s/)[0] : undefined);
const HASHTAGS = "#Accra #ThingsToDoInAccra #AccraFood #Ghana #DuroPlans";

export type QuickFlyer = { spec: FlyerSpec & { venueId?: string; eventId?: string }; caption: string };

export async function quickFlyer(db: SupabaseClient, kind: "venue" | "event", id: string, type: QuickType, theme: FlyerTheme, format: FlyerFormat): Promise<QuickFlyer | null> {
  if (kind === "event") {
    const { data } = await db
      .from("events")
      .select("id, title, event_date, start_time, cost_ghs, description, venues(name, instagram_handle, areas(name)), areas(name)")
      .eq("id", id)
      .maybeSingle();
    const e = data as unknown as {
      id: string;
      title: string;
      event_date: string;
      start_time: string | null;
      cost_ghs: number | null;
      description: string | null;
      venues: { name: string; instagram_handle: string | null; areas: { name: string } | null } | null;
      areas: { name: string } | null;
    } | null;
    if (!e) return null;
    const title = tidyName(e.title);
    const place = [e.venues?.name ? tidyName(e.venues.name) : null, e.venues?.areas?.name ?? e.areas?.name ?? null].filter(Boolean).join(", ");
    const when = [`${LONG_DAY[at(e.event_date).getUTCDay()]} ${shortDate(e.event_date)}`, time12(e.start_time)].filter(Boolean).join(", ");
    const price = e.cost_ghs == null ? null : Number(e.cost_ghs) === 0 ? "Free entry" : `GHS ${Math.round(Number(e.cost_ghs))} a person`;
    const caption = [
      `${title}${place ? ` at ${place}` : ""}, ${when}.${price ? ` ${price}.` : ""}${tag(e.venues?.instagram_handle)}`,
      "",
      "Make a night of it: dinner before, drinks after, real prices and the ride there, planned in a minute on Duro!. Link in bio.",
      "",
      HASHTAGS,
    ].join("\n");
    if (type === "savedate") {
      return {
        spec: {
          layout: "text",
          theme,
          format,
          eyebrow: "Save the date",
          title: `${shortDate(e.event_date)}.`,
          title2: title,
          body: [place, time12(e.start_time), price].filter(Boolean).join(" · ") || undefined,
          cta: "Plan it on the Duro! app",
        },
        caption,
      };
    }
    return {
      spec: { layout: "photo", theme, format, eventId: e.id, badge: when, eyebrow: place || undefined, title, sub: firstSentence(e.description), chip: price ?? undefined, cta: "Plan it on the Duro! app" },
      caption,
    };
  }

  const { data } = await db.from("venues").select("id, name, type, instagram_handle, menu_shared_from, description, areas(name)").eq("id", id).maybeSingle();
  const v = data as unknown as {
    id: string;
    name: string;
    type: string;
    instagram_handle: string | null;
    menu_shared_from: string | null;
    description: string | null;
    areas: { name: string } | null;
  } | null;
  if (!v) return null;
  const name = tidyName(v.name);
  const area = v.areas?.name ?? null;
  const { data: dishes } = await db
    .from("menu_items")
    .select("name, price_ghs, category, recommend_count")
    .eq("venue_id", v.menu_shared_from || v.id)
    .gt("price_ghs", 0)
    .limit(400);
  const menu = ((dishes ?? []) as { name: string; price_ghs: number; category: string; recommend_count: number | null }[]).map((d) => ({ ...d, price_ghs: Number(d.price_ghs) }));
  const mains = menu.filter((d) => d.category === "main").map((d) => d.price_ghs).sort((a, b) => a - b);
  const typical = mains.length >= 3 ? mains[Math.floor(mains.length / 2)] : null;
  const two = typical ? `Two mains from about GHS ${Math.round(typical * 2)}` : null;
  const link = menuUrl(v.id, v.name, area);
  const caption = [
    `${name}${area ? `, ${area}` : ""}.${tag(v.instagram_handle)}`,
    v.description ? `\n${v.description.split(/(?<=\.)\s/).slice(0, 2).join(" ")}` : "",
    two ? `\n${two}. The full menu with prices: ${link}` : `\nMenu and prices: ${link}`,
    "",
    "Plan a night around it, with the ride there, on Duro!. Link in bio.",
    "",
    HASHTAGS,
  ].join("\n");

  if (type === "menu") {
    // Dishes people pick most first, mains before the rest.
    const picked = [...menu]
      .sort((a, b) => (b.recommend_count ?? 0) - (a.recommend_count ?? 0) || Number(b.category === "main") - Number(a.category === "main"))
      .slice(0, format === "story" ? 14 : format === "square" ? 7 : 10);
    return {
      spec: {
        layout: "list",
        theme,
        format,
        eyebrow: [area, "prices from the menu"].filter(Boolean).join(" · "),
        title: name,
        title2: "menu.",
        sections: [{ rows: picked.map((d) => ({ date: `GHS ${Math.round(d.price_ghs)}`, title: d.name })) }],
        cta: "Full menu on duroplans.com",
      },
      caption,
    };
  }
  if (type === "datenight") {
    return {
      spec: {
        layout: "photo",
        theme,
        format,
        venueId: v.id,
        badge: "Date night idea",
        eyebrow: area ?? undefined,
        title: name,
        sub: typical ? `Dinner for two from about GHS ${Math.round(typical * 2)}` : undefined,
        chip: "Plan the night in a minute",
        cta: "Plan it on the Duro! app",
      },
      caption,
    };
  }
  return {
    spec: {
      layout: "photo",
      theme,
      format,
      venueId: v.id,
      badge: area ?? undefined,
      eyebrow: v.type === "restaurant" ? "Where to eat" : v.type === "lounge" ? "Where to drink" : "Where to go",
      title: name,
      sub: firstSentence(v.description),
      chip: two ?? undefined,
      cta: "Plan it on the Duro! app",
    },
    caption,
  };
}
