import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./fetchAll";
import { buildNetwork, type NetLine, type NetStop, type Network } from "./journey";

/**
 * The trotro network, read from the database and held for a few minutes.
 *
 * Fifteen thousand rows across three tables is too much to read per request
 * and too little to need anything cleverer than a module-level cache. Five
 * minutes means an admin's confirm or hide shows up on the page without a
 * deploy, and a burst of requests reads the tables once.
 *
 * Two sources become one network:
 *   - trotro_lines, the 2019 route map and anything an admin has added, with
 *     hidden lines left out entirely;
 *   - trotro_routes, the station-to-station rides entered by hand in 0059,
 *     each turned into a two-stop line between its stations' pins. A ride
 *     whose stations have no pin cannot be placed and is skipped.
 */
const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; net: Network } | null = null;

export async function loadNetwork(supabase: SupabaseClient): Promise<Network> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.net;

  const [stopRows, lineRows, lineStopRows, stations, manual] = await Promise.all([
    fetchAllRows<{ id: string; name: string; landmark: string | null; lat: number; lng: number }>((a, b) =>
      supabase.from("trotro_stops").select("id, name, landmark, lat, lng").range(a, b)
    ),
    fetchAllRows<Record<string, unknown>>((a, b) =>
      supabase.from("trotro_lines").select("*").neq("status", "hidden").range(a, b)
    ),
    fetchAllRows<{ line_id: string; seq: number; stop_id: string; minutes: number | null }>((a, b) =>
      supabase.from("trotro_line_stops").select("line_id, seq, stop_id, minutes").order("line_id").order("seq").range(a, b)
    ),
    supabase.from("trotro_stations").select("id, name, where_exactly, lat, lng").eq("is_active", true),
    supabase.from("trotro_routes").select("*").eq("is_active", true),
  ]);

  const stops: NetStop[] = stopRows.map((s) => ({
    id: s.id,
    name: s.name,
    landmark: s.landmark,
    lat: Number(s.lat),
    lng: Number(s.lng),
  }));

  const byLine = new Map<string, { stopId: string; minutes: number | null }[]>();
  for (const ls of lineStopRows) {
    const list = byLine.get(ls.line_id) ?? [];
    list.push({ stopId: ls.stop_id, minutes: ls.minutes == null ? null : Number(ls.minutes) });
    byLine.set(ls.line_id, list);
  }

  const lines: NetLine[] = lineRows
    .map((l) => ({
      id: l.id as string,
      name: l.name as string,
      headsign: (l.headsign as string | null) ?? null,
      headwayMins: (l.headway_mins as number | null) ?? null,
      status: (l.status === "confirmed" ? "confirmed" : "unchecked") as NetLine["status"],
      source: (l.source === "manual" ? "manual" : "map_2019") as NetLine["source"],
      calledAs: (l.called_as as string | null) ?? null,
      fareMin: l.fare_min_ghs == null ? null : Number(l.fare_min_ghs),
      fareMax: l.fare_max_ghs == null ? null : Number(l.fare_max_ghs),
      notes: (l.notes as string | null) ?? null,
      checkedOn: (l.checked_on as string | null) ?? null,
      stops: byLine.get(l.id as string) ?? [],
    }))
    .filter((l) => l.stops.length >= 2);

  // The hand-entered rides, as two-stop lines between station pins.
  const stationRows = (stations.data ?? []) as { id: string; name: string; where_exactly: string | null; lat: number | null; lng: number | null }[];
  const pinned = new Map(stationRows.filter((s) => s.lat != null && s.lng != null).map((s) => [s.id, s]));
  for (const s of pinned.values()) {
    stops.push({ id: `station:${s.id}`, name: s.name, landmark: s.where_exactly ? `${s.name}, ${s.where_exactly}` : null, lat: Number(s.lat), lng: Number(s.lng) });
  }
  for (const r of (manual.data ?? []) as Record<string, unknown>[]) {
    const a = pinned.get(r.from_station_id as string);
    const b = pinned.get(r.to_station_id as string);
    if (!a || !b) continue;
    lines.push({
      id: `route:${r.id as string}`,
      name: `${a.name} to ${b.name}`,
      headsign: b.name,
      headwayMins: null,
      status: r.checked_on ? "confirmed" : "unchecked",
      source: "manual",
      calledAs: (r.called_as as string | null) ?? null,
      fareMin: r.fare_min_ghs == null ? null : Number(r.fare_min_ghs),
      fareMax: r.fare_max_ghs == null ? null : Number(r.fare_max_ghs),
      notes: [r.board_note, r.runs, r.notes].filter(Boolean).join(". ") || null,
      checkedOn: (r.checked_on as string | null) ?? null,
      stops: [
        { stopId: `station:${a.id}`, minutes: 0 },
        { stopId: `station:${b.id}`, minutes: (r.minutes as number | null) ?? null },
      ],
    });
  }

  const net = buildNetwork(stops, lines);
  cached = { at: Date.now(), net };
  return net;
}
