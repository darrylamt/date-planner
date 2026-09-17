import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { VenueTable } from "@/components/admin/VenueTable";
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
          <div className="text-[14px] text-mutedbrown">
            {rows.length} venues · {staleCount} stale ·{" "}
            <span className={unpricedCount ? "font-semibold text-staletext" : ""}>
              {unpricedCount} with no prices
            </span>{" "}
            ·{" "}
            <span className={noHoursCount ? "font-semibold text-staletext" : ""}>
              {noHoursCount} without opening hours
            </span>
          </div>
        </div>
        <Link href="/admin/venues/new" className="btn btnsm">
          Add venue
        </Link>
      </div>
      <Triage counts={counts} />
      <VenueTable rows={rows} />
    </div>
  );
}

/**
 * What needs doing, above the table.
 *
 * Each card is a queue with work in it, and a queue with nothing waiting is
 * not shown at all, an admin page covered in zeroes trains you to ignore it.
 */
function Triage({ counts }: { counts: Awaited<ReturnType<typeof adminCounts>> }) {
  const cards = [
    {
      // First, because it is the only queue where a real person is waiting on
      // an answer rather than a record waiting on attention.
      href: "/admin/reports",
      n: counts.openReports,
      label: counts.openReports === 1 ? "report" : "reports",
      hint: "People told us something was wrong",
      urgent: true,
    },
    {
      href: "/admin/phones",
      n: counts.phonesReported,
      label: counts.phonesReported === 1 ? "reported number" : "reported numbers",
      hint: "Someone said this number was wrong",
      urgent: true,
    },
    {
      href: "/admin/phones",
      n: counts.phonesPending,
      label: "awaiting phone approval",
      hint: "Not dialled until you approve it",
      urgent: true,
    },
    {
      /*
       * Above the unpriced queue, because an unpriced venue is withheld and a
       * thin one is not: it looks complete, passes every check, and serves the
       * same four dishes to everyone who is ever sent there.
       */
      href: "/admin/menus",
      n: counts.thinMenus,
      label: "with too little menu",
      hint: "Everyone who eats there gets the same few dishes",
      urgent: true,
    },
    {
      href: "/admin/unpriced",
      n: counts.unpriced,
      label: "unpriced",
      hint: "Withheld from plans until priced",
      urgent: true,
    },
    {
      href: "/admin/prices",
      n: counts.staleMenus,
      label: "stale menus",
      hint: "Not touched in 90 days",
      urgent: false,
    },
    {
      href: "/admin?filter=no-hours",
      n: counts.noHours,
      label: "without opening hours",
      hint: "Nothing stops a plan sending someone on a closed day",
      urgent: true,
    },
    {
      href: "/admin?filter=unlinked",
      n: counts.unlinked,
      label: "not linked to Google",
      hint: "Nothing will notice if these close",
      urgent: false,
    },
  ].filter((c) => c.n > 0);

  if (!cards.length) {
    return (
      <p className="mt-5 rounded-bar border border-line bg-cream/60 p-4 text-[14px] text-mutedbrown">
        Nothing needs attention, every venue is priced, verified and its number approved.
      </p>
    );
  }

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c, i) => (
        <Link
          key={i}
          href={c.href}
          className="rounded-bar border border-line bg-cream/60 p-4 transition hover:border-mutedbrown"
        >
          <div className="flex items-baseline gap-2">
            <span
              className={`font-display text-[24px] font-bold tabular-nums ${
                c.urgent ? "text-staletext" : ""
              }`}
            >
              {c.n}
            </span>
            <span className="text-[14px]">{c.label}</span>
          </div>
          <div className="mt-1 text-[12px] text-mutedbrown">{c.hint}</div>
        </Link>
      ))}
    </div>
  );
}
