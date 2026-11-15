import type { SupabaseClient } from "@supabase/supabase-js";
import { tidyName, weekendOf } from "./nudges";
import { menuUrl } from "./menuPage";
import { SITE_URL } from "./site";

/*
 * "This weekend in Accra": five picks for the Thursday post on the WhatsApp
 * Channel and Instagram (owner, 13 Nov 2026 growth plan). One-off events
 * first, priced where the listing gives a price; then a weekly night or a
 * film; then two places people keep in their plans, with a real "dinner for
 * two" from their menus. Every figure is one the catalogue holds.
 */

export type WeekendPick = {
  kind: "event" | "night" | "film" | "place";
  title: string;
  where: string | null;
  when: string;
  price: string | null;
  image: string | null;
  link: string;
};

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayOf = (iso: string) => DAY[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const clock = (t: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
const ghs = (n: number) => `GH₵${Math.round(n)}`;

export async function weekendPicks(db: SupabaseClient, now = new Date()): Promise<{ days: string[]; picks: WeekendPick[] }> {
  const days = weekendOf(now);
  const picks: WeekendPick[] = [];
  const seenVenues = new Set<string>();

  // ── one-off events this weekend, with a price where listed ───────────
  const { data: ev } = await db
    .from("events")
    .select("title, event_date, start_time, cost_ghs, image_url, audience, venue_id, venues(name, image_url, areas(name)), areas(name)")
    .eq("is_active", true)
    .gte("event_date", days[0])
    .lte("event_date", days[2])
    .order("event_date")
    .limit(400);
  const { data: around } = await db
    .from("events")
    .select("title, event_date")
    .eq("is_active", true)
    .gte("event_date", new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10))
    .lte("event_date", new Date(now.getTime() + 14 * 864e5).toISOString().slice(0, 10))
    .limit(3000);
  const runs = new Map<string, number>();
  for (const r of (around ?? []) as { title: string }[]) runs.set(r.title.trim().toLowerCase(), (runs.get(r.title.trim().toLowerCase()) ?? 0) + 1);
  type E = { title: string; event_date: string; start_time: string | null; cost_ghs: number | null; image_url: string | null; audience: string | null; venue_id: string | null; venues: { name: string; image_url: string | null; areas: { name: string } | null } | null; areas: { name: string } | null };
  const events = ((ev ?? []) as unknown as E[])
    .filter((e) => !e.audience || e.audience === "everyone")
    .map((e) => {
      const oneOff = (runs.get(e.title.trim().toLowerCase()) ?? 0) <= 2;
      const evening = (Number(e.start_time?.slice(0, 2)) || 0) >= 17;
      return { e, score: (oneOff ? 4 : 0) + (e.cost_ghs != null ? 2 : 0) + ((e.image_url || e.venues?.image_url) ? 2 : 0) + (evening ? 1 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  const seenTitles = new Set<string>();
  for (const { e } of events) {
    if (picks.length >= 3) break;
    const key = e.title.trim().toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    if (e.venue_id) seenVenues.add(e.venue_id);
    picks.push({
      kind: "event",
      title: tidyName(e.title),
      where: [e.venues?.name ? tidyName(e.venues.name) : null, e.venues?.areas?.name ?? e.areas?.name ?? null].filter(Boolean).join(", ") || null,
      when: [dayOf(e.event_date), clock(e.start_time)].filter(Boolean).join(", "),
      price: e.cost_ghs == null ? null : Number(e.cost_ghs) === 0 ? "Free" : `${ghs(Number(e.cost_ghs))} a person`,
      image: e.image_url ?? e.venues?.image_url ?? null,
      link: SITE_URL,
    });
  }

  // ── a film that opened recently, else a weekly night ─────────────────
  const { data: films } = await db
    .from("cinema_showtimes")
    .select("title, cinema_name, show_date, poster_url, release_date")
    .eq("is_active", true)
    .in("show_date", days)
    .order("release_date", { ascending: false })
    .limit(50);
  const film = ((films ?? []) as { title: string; cinema_name: string | null; show_date: string; poster_url: string | null }[])[0];
  if (film) {
    picks.push({ kind: "film", title: film.title, where: film.cinema_name || "Silverbird Cinemas", when: "All weekend", price: "About GH₵130 a person with snacks, estimated", image: film.poster_url, link: SITE_URL });
  }

  // ── two places people keep, with dinner for two from the menu ────────
  const { data: pull } = await db.from("venue_pull").select("venue_id, effect").gt("effect", 0).order("effect", { ascending: false }).limit(60);
  const ids = ((pull ?? []) as { venue_id: string }[]).map((p) => p.venue_id).filter((id) => !seenVenues.has(id));
  if (ids.length) {
    const { data: vs } = await db.from("venues").select("id, name, type, image_url, menu_shared_from, areas(name, city)").in("id", ids).eq("is_active", true).in("type", ["restaurant", "lounge", "cafe"]);
    const venues = ((vs ?? []) as unknown as { id: string; name: string; type: string; image_url: string | null; menu_shared_from: string | null; areas: { name: string; city: string | null } | null }[]).filter((v) => v.image_url && (v.areas?.city ?? "Accra") === "Accra");
    const order = new Map(ids.map((id, i) => [id, i]));
    venues.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    // Rotate by week, so the same two do not lead every Thursday.
    const week = Math.floor(now.getTime() / (7 * 864e5));
    const rotated = venues.length ? [...venues.slice(week % venues.length), ...venues.slice(0, week % venues.length)] : [];
    for (const v of rotated) {
      if (picks.filter((p) => p.kind === "place").length >= 2 || picks.length >= 5) break;
      const { data: mains } = await db.from("menu_items").select("price_ghs").eq("venue_id", v.menu_shared_from || v.id).eq("category", "main").gt("price_ghs", 0).limit(200);
      const prices = ((mains ?? []) as { price_ghs: number }[]).map((m) => Number(m.price_ghs)).sort((a, b) => a - b);
      if (prices.length < 3) continue;
      const typical = prices[Math.floor(prices.length / 2)];
      picks.push({
        kind: "place",
        title: tidyName(v.name),
        where: v.areas?.name ?? null,
        when: "Any night",
        price: `Two mains from about ${ghs(typical * 2)}`,
        image: v.image_url,
        link: menuUrl(v.id, v.name, v.areas?.name),
      });
    }
  }

  return { days, picks: picks.slice(0, 5) };
}

const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The post's words: one version for the WhatsApp Channel, one for an Instagram caption. */
export function weekendCaptions(days: string[], picks: WeekendPick[]): { whatsapp: string; instagram: string } {
  const range = `${dateLabel(days[0])} to ${dateLabel(days[2])}`;
  const lines = picks.map((p, i) => {
    const bits = [p.where, p.when, p.price].filter(Boolean).join(" · ");
    return `${i + 1}. *${p.title}*${bits ? `\n   ${bits}` : ""}${p.kind === "place" ? `\n   Menu: ${p.link}` : ""}`;
  });
  const whatsapp = [
    `*This weekend in Accra* (${range})`,
    "",
    ...lines,
    "",
    "Want the whole night planned around one of these, with real prices and how to get there? Duro! does it in a minute:",
    SITE_URL,
  ].join("\n");
  const instagram = [
    `This weekend in Accra, ${range}.`,
    "",
    ...picks.map((p, i) => `${i + 1}. ${p.title}${p.where ? `, ${p.where}` : ""}. ${[p.when, p.price].filter(Boolean).join(" · ")}`),
    "",
    "Plan the whole night around one, with real menu prices and the ride there: link in bio.",
    "",
    "#Accra #AccraWeekend #ThingsToDoInAccra #AccraNightlife #Ghana #DuroPlans",
  ].join("\n");
  return { whatsapp, instagram };
}
