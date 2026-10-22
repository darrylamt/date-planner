import { cache } from "react";
import { createServiceClient } from "./supabase/server";
import { fetchAllRows } from "./fetchAll";

/**
 * Menu totals per venue: dishes, dishes per category, and the last edit.
 *
 * The admin's badges, the venues table and the thin-menus queue all need
 * these, and each was reading every menu item to get them: 19,783 rows, a
 * thousand at a time, one page after another. About 4.7 seconds of every admin
 * page, and the venues page paid it twice.
 *
 * Grouped in the database by admin_menu_stats (0090), one row per venue. On a
 * database that has not run it, the rows are read in parallel pages instead
 * and grouped here: slower, never wrong.
 *
 * Cached per request, so the sidebar and the page share one read. Service
 * role: call it only behind the admin gate (the admin layout, adminDataClient).
 */
export interface MenuStat {
  items: number;
  latest: string | null;
  byCategory: Record<string, number>;
}

export const menuStats = cache(async (): Promise<Map<string, MenuStat>> => {
  const db = createServiceClient();
  const out = new Map<string, MenuStat>();

  const { data, error } = await db.rpc("admin_menu_stats");
  if (!error && Array.isArray(data)) {
    for (const r of data as { venue_id: string; items: number; latest: string | null; by_category: Record<string, number> | null }[]) {
      out.set(r.venue_id, { items: Number(r.items) || 0, latest: r.latest, byCategory: r.by_category ?? {} });
    }
    return out;
  }

  // Before 0090: every row, six pages at a time (ordered, so pages cannot overlap).
  const rows = await fetchAllRows<{ venue_id: string; category: string; updated_at: string | null }>(
    (from, to) => db.from("menu_items").select("venue_id, category, updated_at").order("id").range(from, to),
    1000,
    6
  );
  for (const r of rows) {
    const s = out.get(r.venue_id) ?? { items: 0, latest: null, byCategory: {} };
    s.items += 1;
    s.byCategory[r.category] = (s.byCategory[r.category] ?? 0) + 1;
    if (r.updated_at && (!s.latest || r.updated_at > s.latest)) s.latest = r.updated_at;
    out.set(r.venue_id, s);
  }
  return out;
});
