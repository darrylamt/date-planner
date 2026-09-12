import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./fetchAll";

/**
 * What currently needs attention, in one query.
 *
 * The admin side had nine equal-looking links and no way to tell which of them
 * had work waiting behind it, so the queues that matter, a phone number
 * someone reported, venues the planner is silently withholding, were only
 * found by clicking through. These counts drive the nav badges and the
 * dashboard, so the work announces itself.
 *
 * One read of the venue table rather than a count per queue: the table is
 * small, and five round trips to render a sidebar is a slow admin page.
 */
export interface AdminCounts {
  venues: number;
  /** Withheld from planning: no price and no menu, and not flagged free. */
  unpriced: number;
  /** Phone numbers awaiting approval before they can be dialled. */
  phonesPending: number;
  /** Live numbers a user has questioned. The most urgent queue. */
  phonesReported: number;
  /** Active venues not corroborated against the web. */
  noHours: number;
  /** Menus untouched for more than 90 days, or never priced at all. */
  staleMenus: number;
  /** Active venues with no Google link, so a closure would go unnoticed. */
  unlinked: number;
  /** Open reports from people who were actually there. */
  openReports: number;
  /**
   * Restaurants and cafes the planner cannot order a proper meal from.
   *
   * The Buka has four dishes on file and all four are vegetarian, so every
   * plan that sent someone there ordered a table of vegetarian stews. The
   * planner was not wrong; the catalogue only held that. A place people eat
   * at needs enough of its menu on file for the choice to mean anything.
   */
  thinMenus: number;
}

const STALE_DAYS = 90;

export async function adminCounts(supabase: SupabaseClient): Promise<AdminCounts> {
  const [{ data: venues }, { data: menuMeta }] = await Promise.all([
    /*
     * Deliberately `*` rather than a column list. Naming is_free here would
     * make the whole admin section 500 on any database that has not run
     * migration 0005 yet, and the page whose job is to show what needs doing
     * is the worst one to have fail closed.
     */
    supabase.from("venues").select("*"),
    /*
     * Paged, because an unbounded select stops at PostgREST's row cap. The
     * catalogue passed a thousand menu items and these counts silently began
     * reading a fraction of it: Bistro 22 has 156 dishes and was counted as
     * having none, so it appeared in the thin-menu queue it does not belong in.
     */
    fetchAllRows<{ venue_id: string; updated_at: string | null; category: string }>(
      (from, to) =>
        supabase.from("menu_items").select("venue_id, updated_at, category").range(from, to)
    ).then((data) => ({ data })),
  ]);

  /*
   * Its own query, and tolerant of failing. This table arrived in migration
   * 0009, and the page whose job is to show what needs doing is the worst one
   * to take down on a database that has not run it.
   */
  const { data: reports } = await supabase
    .from("venue_reports")
    .select("id")
    .eq("status", "open");

  const rows = venues ?? [];
  const active = rows.filter((v: any) => v.is_active);

  const menuCount = new Map<string, number>();
  const mainCount = new Map<string, number>();
  const menuLatest = new Map<string, string>();
  for (const m of menuMeta ?? []) {
    const id = (m as any).venue_id as string;
    menuCount.set(id, (menuCount.get(id) ?? 0) + 1);
    if ((m as any).category === "main") mainCount.set(id, (mainCount.get(id) ?? 0) + 1);
    const at = (m as any).updated_at as string | null;
    if (at && (!menuLatest.get(id) || at > menuLatest.get(id)!)) menuLatest.set(id, at);
  }

  const cutoff = Date.now() - STALE_DAYS * 86400000;

  return {
    venues: rows.length,
    // `?? false` so this reads correctly before migration 0005 adds the column.
    unpriced: active.filter(
      (v: any) =>
        !(v.is_free ?? false) &&
        Number(v.avg_cost_per_person_ghs) <= 0 &&
        (menuCount.get(v.id) ?? 0) === 0
    ).length,
    // Counted across every venue, not just active ones: a number on a paused
    // venue is still a number that could be dialled if it is switched back on.
    phonesPending: rows.filter((v: any) => v.phone_status === "pending").length,
    phonesReported: rows.filter((v: any) => (v.phone_report_count ?? 0) > 0).length,
    noHours: active.filter(
      (v: any) => !Array.isArray(v.opening_periods) || v.opening_periods.length === 0
    ).length,
    unlinked: active.filter((v: any) => !v.google_place_id).length,
    openReports: (reports ?? []).length,
    /*
     * Five is the point at which a spread of four dishes stops being the whole
     * menu. Below it, every group that eats there is served the same handful
     * whatever they asked for.
     */
    thinMenus: active.filter(
      (v: any) =>
        (v.type === "restaurant" || v.type === "cafe") && (mainCount.get(v.id) ?? 0) < 5
    ).length,
    staleMenus: active.filter((v: any) => {
      const latest = menuLatest.get(v.id);
      // A venue priced by its per-person figure has no menu to go stale.
      if (!latest) return (menuCount.get(v.id) ?? 0) > 0;
      return new Date(latest).getTime() < cutoff;
    }).length,
  };
}
