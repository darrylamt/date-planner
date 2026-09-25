/**
 * The trip planner against the real 2019 route map, offline.   npm run journey:check [-- GTFS_Accra.zip]
 *
 * Reads the map straight from the GTFS file rather than the database, so it
 * runs before the import and cannot be fooled by anything an admin changed.
 * Checks the planner's promises, not particular routes: a six-year-old map is
 * not a fixture to pin exact answers to.
 */
import fs from "fs";
import { unzipSync, strFromU8 } from "fflate";
import { minutesOf, parseCsv } from "./gtfs-csv";
import { buildNetwork, planJourney, type NetLine, type NetStop } from "../src/lib/journey";

const SOURCE = "https://gitlab.com/digitaltransport/data/africa/accra/-/raw/master/GTFS/GTFS_Accra.zip";

async function main() {
  const local = process.argv[2];
  const bytes = local ? new Uint8Array(fs.readFileSync(local)) : new Uint8Array(await (await fetch(SOURCE)).arrayBuffer());
  const files = unzipSync(bytes);
  const read = (n: string) => parseCsv(strFromU8(files[n]));

  const stops: NetStop[] = read("stops.txt").map((s) => ({
    id: s.stop_id,
    name: s.stop_name,
    landmark: null,
    lat: Number(s.stop_lat),
    lng: Number(s.stop_lon),
  }));
  const routeName = new Map(read("routes.txt").map((r) => [r.route_id, r.route_long_name]));
  const headway = new Map(read("frequencies.txt").map((f) => [f.trip_id, Math.round(Number(f.headway_secs) / 60)]));
  const times = new Map<string, Record<string, string>[]>();
  for (const st of read("stop_times.txt")) {
    const l = times.get(st.trip_id) ?? [];
    l.push(st);
    times.set(st.trip_id, l);
  }
  const lines: NetLine[] = read("trips.txt").map((t) => {
    const list = (times.get(t.trip_id) ?? []).sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    const start = list[0] ? minutesOf(list[0].departure_time) : 0;
    return {
      id: t.trip_id,
      name: routeName.get(t.route_id) ?? "Trotro",
      headsign: t.trip_headsign || null,
      headwayMins: headway.get(t.trip_id) ?? null,
      status: "unchecked",
      source: "map_2019",
      calledAs: null,
      fareMin: null,
      fareMax: null,
      notes: null,
      checkedOn: null,
      stops: list.map((st) => ({ stopId: st.stop_id, minutes: minutesOf(st.arrival_time) - start })),
    };
  });

  const t0 = Date.now();
  const net = buildNetwork(stops, lines);
  console.log(`network: ${stops.length} stops, ${lines.length} line directions, built in ${Date.now() - t0} ms\n`);

  const places = {
    osu: { lat: 5.556, lng: -0.182, label: "Oxford Street, Osu" },
    madina: { lat: 5.6685, lng: -0.1655, label: "Madina Market" },
    kaneshie: { lat: 5.5695, lng: -0.2365, label: "Kaneshie Market" },
    eastLegon: { lat: 5.6365, lng: -0.1545, label: "East Legon, A&C Mall" },
    osuNear: { lat: 5.5585, lng: -0.1805, label: "Two streets over in Osu" },
    kokrobite: { lat: 5.4956, lng: -0.3739, label: "Kokrobite beach" },
  };

  let fails = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  -- ${detail}` : ""}`);
    if (!ok) fails++;
  };
  const describe = (o: ReturnType<typeof planJourney>[number]) =>
    `${o.kind}, ${o.minutes} min${o.taxiGhs ? `, taxi GHS ${o.taxiGhs}` : ""}: ` +
    o.steps
      .map((s) =>
        s.kind === "walk"
          ? `walk ${s.minutes}m to ${s.toLabel}`
          : s.kind === "taxi"
            ? `taxi ${s.fromLabel} -> ${s.toLabel} (${s.reason})`
            : `ride "${s.line.name}" ${s.board.name} -> ${s.alight.name}`
      )
      .join(" | ");

  const trip = (a: keyof typeof places, b: keyof typeof places) => {
    const t = Date.now();
    const out = planJourney(net, places[a], places[b]);
    const ms = Date.now() - t;
    console.log(`\n${places[a].label} -> ${places[b].label} (${ms} ms)`);
    out.forEach((o) => console.log("   " + describe(o)));
    return { out, ms };
  };

  const a = trip("osu", "madina");
  check("Osu to Madina has a trotro answer", a.out.some((o) => o.kind === "trotro"));
  check("always ends with the taxi comparison", a.out[a.out.length - 1].kind === "taxi");
  check("fast enough to run per request", a.ms < 1500, `${a.ms} ms`);
  check("unchecked map lines are flagged", a.out.filter((o) => o.kind === "trotro").every((o) => o.unchecked));
  check("no fare invented for map lines", a.out.every((o) => o.trotroFareMin === null));

  const b = trip("kaneshie", "eastLegon");
  check("Kaneshie to East Legon has a trotro answer", b.out.some((o) => o.kind.startsWith("trotro")));
  check("at most one change", b.out.every((o) => o.steps.filter((s) => s.kind === "ride").length <= 2));

  const c = trip("osu", "osuNear");
  check("a short hop is a walk, not a trotro", c.out[0].kind === "walk");

  const d = trip("madina", "kokrobite");
  check("somewhere trotros barely reach still gets an answer", d.out.length >= 1);
  check(
    "a taxi leg names why",
    d.out.flatMap((o) => o.steps).filter((s) => s.kind === "taxi").every((s) => s.kind === "taxi" && s.reason.length > 0)
  );

  // Every ride runs forward along its own line.
  const forward = [a, b, d].flatMap((x) => x.out).flatMap((o) => o.steps).every((s) => {
    if (s.kind !== "ride") return true;
    const ids = s.line.stops.map((x) => x.stopId);
    return ids.indexOf(s.board.id) < ids.lastIndexOf(s.alight.id);
  });
  check("every ride runs forward along its line", forward);

  console.log(`\n${fails ? `${fails} failed` : "all passed"}`);
  process.exit(fails ? 1 : 0);
}
main();
