/**
 * Load the 2019 Accra trotro route map into trotro_stops, trotro_lines and
 * trotro_line_stops.   npm run transit:import   [-- path/to/GTFS_Accra.zip]
 *
 * Source: OpenStreetMap Ghana with Digital Transport for Africa, published as
 * GTFS. Map data © OpenStreetMap contributors, Open Database Licence.
 *
 * Safe to run again. It only ever writes what the map says: stop names and
 * pins, line names, direction and frequency, and the order of stops. Anything
 * an admin has set -- a line's status, fares, what the mate calls out, a
 * stop's landmark -- is left exactly as it is, because re-importing a
 * six-year-old map must never undo a check somebody made last week.
 */
import fs from "fs";
import { unzipSync, strFromU8 } from "fflate";
import { minutesOf, parseCsv } from "./gtfs-csv";
import { createClient } from "@supabase/supabase-js";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const SOURCE = "https://gitlab.com/digitaltransport/data/africa/accra/-/raw/master/GTFS/GTFS_Accra.zip";
const KEPT = "data/gtfs/accra-GTFS_Accra.zip";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function inBatches<T>(rows: T[], size: number, run: (batch: T[]) => PromiseLike<{ error: unknown }>) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await run(rows.slice(i, i + size));
    if (error) throw error;
  }
}

async function selectAll<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

async function main() {
  // The copy kept in the repo unless told otherwise; see data/gtfs/PROVENANCE.md.
  const local = process.argv[2] ?? (fs.existsSync(KEPT) ? KEPT : undefined);
  const bytes = local
    ? new Uint8Array(fs.readFileSync(local))
    : new Uint8Array(await (await fetch(SOURCE)).arrayBuffer());
  const files = unzipSync(bytes);
  const read = (name: string) => parseCsv(strFromU8(files[name]));

  const stops = read("stops.txt");
  const routes = read("routes.txt");
  const trips = read("trips.txt");
  const stopTimes = read("stop_times.txt");
  const frequencies = read("frequencies.txt");
  const feed = read("feed_info.txt")[0];
  console.log(
    `map ${feed?.feed_start_date}–${feed?.feed_end_date}: ${routes.length} routes, ${trips.length} directions, ${stops.length} stops`
  );

  // ── stops: name and pin only, never the landmark ──
  await inBatches(
    stops
      .filter((s) => s.stop_lat && s.stop_lon)
      .map((s) => ({
        gtfs_stop_id: s.stop_id,
        name: s.stop_name || "Unnamed stop",
        lat: Number(s.stop_lat),
        lng: Number(s.stop_lon),
      })),
    500,
    (b) => db.from("trotro_stops").upsert(b, { onConflict: "gtfs_stop_id" })
  );
  const stopId = new Map(
    (await selectAll<{ id: string; gtfs_stop_id: string }>("trotro_stops", "id, gtfs_stop_id")).map((s) => [
      s.gtfs_stop_id,
      s.id,
    ])
  );

  // ── lines: one per direction; status, fares and notes are left alone ──
  const routeName = new Map(routes.map((r) => [r.route_id, r.route_long_name || r.route_short_name || "Trotro"]));
  const headway = new Map(
    frequencies.map((f) => [f.trip_id, Math.max(1, Math.round(Number(f.headway_secs) / 60))])
  );
  await inBatches(
    trips.map((t) => ({
      gtfs_trip_id: t.trip_id,
      gtfs_route_id: t.route_id,
      name: routeName.get(t.route_id) ?? "Trotro",
      headsign: t.trip_headsign || null,
      headway_mins: headway.get(t.trip_id) ?? null,
      source: "map_2019",
    })),
    500,
    (b) => db.from("trotro_lines").upsert(b, { onConflict: "gtfs_trip_id" })
  );
  const lineId = new Map(
    (await selectAll<{ id: string; gtfs_trip_id: string | null }>("trotro_lines", "id, gtfs_trip_id"))
      .filter((l) => l.gtfs_trip_id)
      .map((l) => [l.gtfs_trip_id!, l.id])
  );

  // ── the order of stops on each line, replaced wholesale for map lines ──
  const byTrip = new Map<string, Record<string, string>[]>();
  for (const st of stopTimes) {
    const list = byTrip.get(st.trip_id) ?? [];
    list.push(st);
    byTrip.set(st.trip_id, list);
  }
  const lineStops: { line_id: string; seq: number; stop_id: string; minutes: number | null }[] = [];
  let skipped = 0;
  for (const [trip, list] of byTrip) {
    const line = lineId.get(trip);
    if (!line) continue;
    list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    const start = list[0]?.departure_time ? minutesOf(list[0].departure_time) : null;
    list.forEach((st, i) => {
      const stop = stopId.get(st.stop_id);
      if (!stop) return void skipped++;
      const at = st.arrival_time || st.departure_time;
      lineStops.push({
        line_id: line,
        seq: i + 1,
        stop_id: stop,
        minutes: start != null && at ? Math.round((minutesOf(at) - start) * 10) / 10 : null,
      });
    });
  }
  const mapLines = [...new Set(lineStops.map((l) => l.line_id))];
  await inBatches(mapLines, 200, (b) => db.from("trotro_line_stops").delete().in("line_id", b));
  await inBatches(lineStops, 1000, (b) => db.from("trotro_line_stops").insert(b));

  console.log(
    `loaded ${stopId.size} stops, ${lineId.size} line directions, ${lineStops.length} stops-on-lines${
      skipped ? ` (${skipped} referenced a stop with no pin and were left out)` : ""
    }`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
