import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What currently needs attention, in one query.
 *
 * The admin side had nine equal-looking links and no way to tell which of them
 * had work waiting behind it, so the queues that matter — a phone number
 * someone reported, venues the planner is silently withholding — were only
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
  unverified: number;
  /** Menus untouched for more than 90 days, or never priced at all. */
  staleMenus: number;
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
    supabase.from("menu_items").select("venue_id, updated_at"),
  ]);

  const rows = venues ?? [];
  const active = rows.filter((v: any) => v.is_active);

  const menuCount = new Map<string, number>();
  const menuLatest = new Map<string, string>();
  for (const m of menuMeta ?? []) {
    const id = (m as any).venue_id as string;
    menuCount.set(id, (menuCount.get(id) ?? 0) + 1);
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
    unverified: active.filter((v: any) => v.verification_status !== "real").length,
    staleMenus: active.filter((v: any) => {
      const latest = menuLatest.get(v.id);
      // A venue priced by its per-person figure has no menu to go stale.
      if (!latest) return (menuCount.get(v.id) ?? 0) > 0;
      return new Date(latest).getTime() < cutoff;
    }).length,
  };
}
