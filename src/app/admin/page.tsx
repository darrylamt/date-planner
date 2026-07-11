import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VenueTable } from "@/components/admin/VenueTable";

export const dynamic = "force-dynamic";

/** Venues CRUD table with the "stale menu" indicator (> 90 days). */
export default async function AdminVenuesPage() {
  const supabase = createClient();

  const [{ data: venues }, { data: menuMeta }] = await Promise.all([
    supabase.from("venues").select("*, areas(name)").order("name"),
    supabase.from("menu_items").select("venue_id, price_ghs, updated_at"),
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
      area: v.areas?.name ?? "—",
      type: v.type,
      is_active: v.is_active,
      items: meta?.count ?? 0,
      avgForTwo: Math.round(Number(v.avg_cost_per_person_ghs) * 2),
      staleDays,
      isStale: staleDays === null || staleDays > 90,
    };
  });

  const staleCount = rows.filter((r) => r.isStale).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold">Venues</h1>
          <div className="text-[14px] text-mutedbrown">
            {rows.length} venues · {staleCount} stale
          </div>
        </div>
        <Link href="/admin/venues/new" className="btn btnsm">
          Add venue
        </Link>
      </div>
      <VenueTable rows={rows} />
    </div>
  );
}
