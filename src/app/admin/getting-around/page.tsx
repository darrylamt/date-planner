import { adminDataClient } from "@/lib/adminAuth";
import { fetchAllRows } from "@/lib/fetchAll";
import { haversineKm } from "@/lib/transport";
import { GettingAroundManager } from "@/components/admin/GettingAroundManager";
import type { Area } from "@/lib/types";
import type { CarRental, TrotroRoute, TrotroStation, VenueAccess } from "@/lib/transit";

export const dynamic = "force-dynamic";

export interface AccessVenue {
  id: string;
  name: string;
  area_id: string;
  lat: number | null;
  lng: number | null;
}

/** One direction of a route-map line, as the review list needs it. */
export interface LineSummary {
  id: string;
  gtfs_route_id: string | null;
  name: string;
  headsign: string | null;
  headway_mins: number | null;
  source: string;
  status: "unchecked" | "confirmed" | "hidden";
  called_as: string | null;
  fare_min_ghs: number | null;
  fare_max_ghs: number | null;
  notes: string | null;
  checked_on: string | null;
  stop_count: number;
  /** Live venues within 500 m of a stop on it: how much checking it is worth. */
  near_venues: number;
}

/**
 * Which lines are worth checking first.
 *
 * A line through three streets of our restaurants matters more than one out
 * to a suburb we hold nothing in, and with 554 directions to get through the
 * order is most of the value. Counted here once per page load over a coarse
 * grid, so it is venues times nearby stops rather than venues times all four
 * thousand.
 */
async function summariseLines(
  supabase: Awaited<ReturnType<typeof adminDataClient>>,
  venues: AccessVenue[]
): Promise<LineSummary[] | null> {
  try {
    const [lines, lineStops, stops] = await Promise.all([
      fetchAllRows<Record<string, unknown>>((a, b) => supabase.from("trotro_lines").select("*").order("name").range(a, b)),
      fetchAllRows<{ line_id: string; stop_id: string }>((a, b) =>
        supabase.from("trotro_line_stops").select("line_id, stop_id").order("line_id").order("seq").range(a, b)
      ),
      fetchAllRows<{ id: string; lat: number; lng: number }>((a, b) =>
        supabase.from("trotro_stops").select("id, lat, lng").range(a, b)
      ),
    ]);

    const cell = (lat: number, lng: number) => `${Math.floor(lat / 0.01)}:${Math.floor(lng / 0.01)}`;
    const grid = new Map<string, { lat: number; lng: number }[]>();
    for (const v of venues) {
      if (v.lat == null || v.lng == null) continue;
      const key = cell(Number(v.lat), Number(v.lng));
      const list = grid.get(key) ?? [];
      list.push({ lat: Number(v.lat), lng: Number(v.lng) });
      grid.set(key, list);
    }
    // Which venues each stop has within 500 m, by index into a flat list.
    const flat = [...grid.values()].flat();
    const indexOf = new Map(flat.map((v, i) => [v, i]));
    const nearStop = new Map<string, number[]>();
    for (const st of stops) {
      const lat = Number(st.lat);
      const lng = Number(st.lng);
      const [ci, cj] = cell(lat, lng).split(":").map(Number);
      const hits: number[] = [];
      for (let i = ci - 1; i <= ci + 1; i++)
        for (let j = cj - 1; j <= cj + 1; j++)
          for (const v of grid.get(`${i}:${j}`) ?? []) if (haversineKm({ lat, lng }, v) <= 0.5) hits.push(indexOf.get(v)!);
      if (hits.length) nearStop.set(st.id, hits);
    }

    const perLine = new Map<string, { count: number; venues: Set<number> }>();
    for (const ls of lineStops) {
      const agg = perLine.get(ls.line_id) ?? { count: 0, venues: new Set<number>() };
      agg.count++;
      for (const v of nearStop.get(ls.stop_id) ?? []) agg.venues.add(v);
      perLine.set(ls.line_id, agg);
    }

    return lines.map((l) => ({
      id: l.id as string,
      gtfs_route_id: (l.gtfs_route_id as string | null) ?? null,
      name: l.name as string,
      headsign: (l.headsign as string | null) ?? null,
      headway_mins: (l.headway_mins as number | null) ?? null,
      source: l.source as string,
      status: l.status as LineSummary["status"],
      called_as: (l.called_as as string | null) ?? null,
      fare_min_ghs: l.fare_min_ghs == null ? null : Number(l.fare_min_ghs),
      fare_max_ghs: l.fare_max_ghs == null ? null : Number(l.fare_max_ghs),
      notes: (l.notes as string | null) ?? null,
      checked_on: (l.checked_on as string | null) ?? null,
      stop_count: perLine.get(l.id as string)?.count ?? 0,
      near_venues: perLine.get(l.id as string)?.venues.size ?? 0,
    }));
  } catch {
    // 0060 not run yet: the tab says so rather than the whole page failing.
    return null;
  }
}

export default async function AdminGettingAroundPage() {
  const supabase = await adminDataClient();
  const [stations, routes, access, rentals, areas, venues] = await Promise.all([
    supabase.from("trotro_stations").select("*").order("name"),
    supabase.from("trotro_routes").select("*").order("created_at"),
    supabase.from("venue_access").select("*"),
    supabase.from("car_rentals").select("*").order("name"),
    supabase.from("areas").select("*").order("name"),
    supabase.from("venues").select("id, name, area_id, lat, lng").eq("is_active", true).order("name"),
  ]);

  // The one failure worth naming: the migration has not been run yet.
  const missing = [stations, routes, access, rentals].find((r) => r.error)?.error;
  if (missing) {
    return (
      <div className="max-w-[720px]">
        <h1 className="font-display text-[24px] font-bold">Getting around</h1>
        <div className="card mt-5 p-5 text-[14px]">
          <b>Run migration 0059_getting_around.sql first.</b>
          <div className="mt-2 text-mutedbrown">
            The tables this page edits do not exist yet ({missing.message}). Paste the file into the
            Supabase SQL editor, run it, and reload.
          </div>
        </div>
      </div>
    );
  }

  const lines = await summariseLines(supabase, (venues.data ?? []) as AccessVenue[]);

  return (
    <GettingAroundManager
      lines={lines}
      stations={(stations.data ?? []) as TrotroStation[]}
      routes={(routes.data ?? []) as TrotroRoute[]}
      access={(access.data ?? []) as VenueAccess[]}
      rentals={(rentals.data ?? []) as CarRental[]}
      areas={(areas.data ?? []) as Area[]}
      venues={(venues.data ?? []) as AccessVenue[]}
    />
  );
}
