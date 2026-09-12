import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { VenueTable } from "@/components/admin/VenueTable";
import { adminCounts } from "@/lib/adminCounts";

export const dynamic = "force-dynamic";

/** Venues CRUD table with the "stale menu" indicator (> 90 days). */
export default async function AdminVenuesPage() {
  const supabase = await adminDataClient();

  const [{ data: venues }, { data: menuMeta }, counts] = await Promise.all([
    supabase.from("venues").select("*, areas(name)").order("name"),
    supabase.from("menu_items").select("venue_id, price_ghs, updated_at"),
    adminCounts(supabase),
  ]);

  const items = menuMeta ?? [];
  const byVenue = new Map<string, { count: number; latest: string | null; avg: number }>();
  for (const it of items) {
    const cur = byVenue.get(it.venue_id) ?? { count: 0, latest: null, avg: 0 };
    cur.count += 1;
    cur.avg += Number(it.price_ghs);
    if (!cur.latest || it.updated_at > cur.latest) cur.latest = it.updated_at;
    byVenue.set(it.venue_id, cur);
  }

  const rows = (venues ?? []).map((v: any) => {
    const meta = byVenue.get(v.id);
    const latest = meta?.latest ? new Date(meta.latest) : null;
    const staleDays = latest
      ? Math.floor((Date.now() - latest.getTime()) / 86400000)
      : null;
    return {
      id: v.id,
      name: v.name,
      area: v.areas?.name ?? "no area",
      type: v.type,
      is_active: v.is_active,
      items: meta?.count ?? 0,
      avgForTwo: Math.round(Number(v.avg_cost_per_person_ghs) * 2),
      staleDays,
      isStale: staleDays === null || staleDays > 90,
      // Whether anything stops a plan sending someone when the place is shut.
      hoursKnown: Array.isArray(v.opening_periods) && v.opening_periods.length > 0,
    };
  });

  const staleCount = rows.filter((r) => r.isStale).length;
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
      href: "/admin",
      n: counts.noHours,
      label: "without opening hours",
      hint: "Nothing stops a plan sending someone on a closed day",
      urgent: true,
    },
    {
      href: "/admin",
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
