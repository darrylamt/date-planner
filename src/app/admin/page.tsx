import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { VenueTable, type Queue } from "@/components/admin/VenueTable";
import { adminCounts } from "@/lib/adminCounts";
import { fetchAllRows } from "@/lib/fetchAll";

export const dynamic = "force-dynamic";

/** Venues CRUD table with the "stale menu" indicator (> 90 days). */
export default async function AdminVenuesPage() {
  const supabase = await adminDataClient();

  const [{ data: venues }, menuMeta, counts] = await Promise.all([
    supabase.from("venues").select("*, areas(name)").order("name"),
    // Paged: an unbounded select returns the first thousand, and the catalogue
    // holds 2,306 menu items, so the item counts and averages on this very
    // table were reading a third of the data and showing 0 for the rest.
    fetchAllRows<{ venue_id: string; price_ghs: number; updated_at: string | null }>(
      (from, to) =>
        supabase.from("menu_items").select("venue_id, price_ghs, updated_at").range(from, to)
    ),
    adminCounts(supabase),
  ]);

  const items = menuMeta;
  const byVenue = new Map<string, { count: number; latest: string | null; avg: number }>();
  for (const it of items) {
    const cur = byVenue.get(it.venue_id) ?? { count: 0, latest: null, avg: 0 };
    cur.count += 1;
    cur.avg += Number(it.price_ghs);
    if (it.updated_at && (!cur.latest || it.updated_at > cur.latest)) {
      cur.latest = it.updated_at;
    }
    byVenue.set(it.venue_id, cur);
  }

  const rows = (venues ?? []).map((v: any) => {
    /*
     * Read through the share, like the Menus screen and the sidebar badge
     * already do. A branch priced from another venue's menu has no items of
     * its own, so counting by its own id alone showed every Honeysuckle branch
     * as holding nothing and never updated.
     */
    const owner = (v.menu_shared_from as string | null) || v.id;
    const meta = byVenue.get(owner);
    const latest = meta?.latest ? new Date(meta.latest) : null;
    const staleDays = latest
      ? Math.floor((Date.now() - latest.getTime()) / 86400000)
      : null;
    const hasMenu = (meta?.count ?? 0) > 0;
    const priced = v.is_free === true || Number(v.avg_cost_per_person_ghs) > 0 || hasMenu;
    return {
      id: v.id,
      name: v.name,
      area: v.areas?.name ?? "no area",
      type: v.type,
      is_active: v.is_active,
      items: meta?.count ?? 0,
      avgForTwo: Math.round(Number(v.avg_cost_per_person_ghs) * 2),
      staleDays,
      /*
       * A menu can go stale. The absence of one cannot.
       *
       * This read `staleDays === null || staleDays > 90`, so any venue with no
       * menu items was stale forever and no amount of work could clear it.
       * Aburi Botanical Gardens charges one entrance fee and is never going to
       * have dishes, so it sat permanently red next to venues whose prices had
       * genuinely rotted, which is how a real warning stops being read. The
       * rule adminCounts already applies to the Prices badge is the right one,
       * and this now matches it.
       */
      isStale: staleDays !== null && staleDays > 90,
      /*
       * Three states, because "no menu" splits into two very different jobs
       * and only one of them is anybody's to do. A venue with a per-person
       * figure and no menu is finished; a venue with neither is unpriced and
       * belongs in that queue.
       */
      pricedBy: hasMenu ? ("menu" as const) : priced ? ("figure" as const) : ("nothing" as const),
      // Whether anything stops a plan sending someone when the place is shut.
      hoursKnown: Array.isArray(v.opening_periods) && v.opening_periods.length > 0,
      // Linked venues are the only ones the closure sweep can notice.
      linked: Boolean(v.google_place_id),
    };
  });

  const staleCount = rows.filter((r) => r.isStale).length;
  // Counted separately from stale: these are not rotting, they were never
  // priced, and the fix is the Unpriced queue rather than a menu re-read.
  const unpricedCount = rows.filter((r) => r.is_active && r.pricedBy === "nothing").length;
  // A venue with no hours can be put in a plan for a day it is closed, so it
  // sits next to the stale count rather than being buried in the table.
  const noHoursCount = rows.filter((r) => !r.hoursKnown).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold">Venues</h1>
          {/*
            The total, and nothing else. Stale, unpriced and no-hours were
            spelled out here, again as tiles underneath, and again as chips
            below that: the same three numbers three times on one screen. The
            chips are the version that can be clicked.
          */}
          <div className="text-[14px] text-mutedbrown">{rows.length} venues</div>
        </div>
        <Link href="/admin/venues/new" className="btn btnsm">
          Add venue
        </Link>
      </div>
      <VenueTable rows={rows} queues={queues(counts)} />
    </div>
  );
}

/**
 * The queues that are not a filter on this table.
 *
 * Reports, unapproved numbers and thin menus live on their own pages and
 * cannot be expressed as a predicate over the rows here, so they travel as
 * links rather than filters. Everything else that used to be a tile --
 * unpriced, stale, no hours, not on Google -- is already a chip, and was
 * being counted twice on the same screen.
 *
 * A queue with nothing in it is not shown. An admin page covered in zeroes
 * trains you to stop reading it.
 */
function queues(counts: Awaited<ReturnType<typeof adminCounts>>): Queue[] {
  return [
    // First, because it is the only queue where a real person is waiting.
    {
      href: "/admin/reports",
      label: counts.openReports === 1 ? "Report" : "Reports",
      n: counts.openReports,
      urgent: true,
    },
    {
      href: "/admin/phones",
      label: "Reported numbers",
      n: counts.phonesReported,
      urgent: true,
    },
    {
      href: "/admin/phones",
      label: "Phone approval",
      n: counts.phonesPending,
      urgent: true,
    },
    /*
     * Above the unpriced chip in importance, though it reads as milder: an
     * unpriced venue is withheld from plans and a thin one is not. It looks
     * complete, passes every check, and serves the same four dishes to
     * everyone who is ever sent there.
     */
    {
      href: "/admin/menus",
      label: "Thin menus",
      n: counts.thinMenus,
      urgent: true,
    },
  ].filter((q) => q.n > 0);
}
