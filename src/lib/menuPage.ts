import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "./site";

/**
 * Public menu pages, found by Google (owner, 13 Nov 2026: "let Google find
 * the menus"): /menu/<venue id>/<name-and-area>. The id finds the venue; the
 * words are for people and search, and a page reached by old words is sent
 * on to the current ones.
 *
 * A page is listed for Google only when the menu has enough on it to be
 * worth landing on (MIN_ITEMS priced items); thinner ones still open, as
 * noindex, for a QR sticker printed before the menu was in.
 */
export const MIN_ITEMS = 5;

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/** "/menu/<id>/ilona-osu": the name, with the area when the name does not already say it. */
export function menuPath(id: string, name: string, area?: string | null): string {
  const words = slugify(name);
  const where = area ? slugify(area) : "";
  return `/menu/${id}/${where && !words.includes(where) ? `${words}-${where}` : words}`;
}

export const menuUrl = (id: string, name: string, area?: string | null) => `${SITE_URL}${menuPath(id, name, area)}`;

/** Venues whose menu is worth a page, with the counts that decide it. Read once a day for the sitemap. */
export async function listedMenus(db: SupabaseClient): Promise<{ id: string; name: string; area: string | null; updated: string | null }[]> {
  const venues: { id: string; name: string; type: string; menu_shared_from: string | null; areas: { name: string } | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("venues").select("id, name, type, menu_shared_from, areas(name)").eq("is_active", true).neq("type", "stay").order("id").range(from, from + 999);
    venues.push(...((data ?? []) as unknown as typeof venues));
    if ((data ?? []).length < 1000) break;
  }
  const counts = new Map<string, { n: number; updated: string | null }>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("menu_items").select("venue_id, updated_at").gt("price_ghs", 0).order("id").range(from, from + 999);
    for (const r of (data ?? []) as { venue_id: string; updated_at: string | null }[]) {
      const c = counts.get(r.venue_id) ?? { n: 0, updated: null };
      c.n++;
      if (r.updated_at && (!c.updated || r.updated_at > c.updated)) c.updated = r.updated_at;
      counts.set(r.venue_id, c);
    }
    if ((data ?? []).length < 1000) break;
  }
  return venues
    .map((v) => ({ v, c: counts.get(v.menu_shared_from || v.id) }))
    .filter((x) => (x.c?.n ?? 0) >= MIN_ITEMS)
    .map(({ v, c }) => ({ id: v.id, name: v.name, area: v.areas?.name ?? null, updated: c?.updated ?? null }));
}
