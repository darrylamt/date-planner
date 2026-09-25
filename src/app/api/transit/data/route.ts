import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/fetchAll";

/**
 * Our trotro network, free to download.   GET /api/transit/data
 *
 * Not a courtesy: the Open Database Licence requires it. The stops and lines
 * started as the 2019 OpenStreetMap Ghana / DT4A route map, and every fare,
 * landmark and confirmation added in the admin makes this a derivative of
 * it. The planner uses that derivative publicly, so the derivative itself has
 * to be available under the same licence.
 *
 * Only the network, never the catalogue. Venues, menus, prices and the
 * per-venue directions are our own data held in separate tables, which the
 * licence leaves alone; nothing here reads them.
 *
 * Hidden lines are left out: the anon key cannot read them, and a line an
 * admin hid because it no longer runs is not something to hand out as data.
 */
// Per request, cached at the edge for an hour. Not prerendered: a build before the
// import would bake "not loaded yet" in.
export const dynamic = "force-dynamic";

export async function GET() {
  const db = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  try {
    const [stops, lines, lineStops] = await Promise.all([
      fetchAllRows<Record<string, unknown>>((a, b) =>
        db.from("trotro_stops").select("id, gtfs_stop_id, name, landmark, lat, lng").order("id").range(a, b)
      ),
      fetchAllRows<Record<string, unknown>>((a, b) =>
        db
          .from("trotro_lines")
          .select("id, gtfs_trip_id, gtfs_route_id, name, headsign, headway_mins, source, status, called_as, fare_min_ghs, fare_max_ghs, notes, checked_on")
          .order("id")
          .range(a, b)
      ),
      fetchAllRows<Record<string, unknown>>((a, b) =>
        db.from("trotro_line_stops").select("line_id, seq, stop_id, minutes").order("line_id").order("seq").range(a, b)
      ),
    ]);

    // Empty is "not imported yet", and must not be cached for an hour as a dataset.
    if (!lines.length) throw new Error("empty");
    const visible = new Set(lines.map((l) => l.id));
    return NextResponse.json(
      {
        licence: "Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/",
        attribution:
          "© OpenStreetMap contributors. Based on the 2019 Accra route map by OpenStreetMap Ghana and Digital Transport for Africa, with corrections by aduro.",
        notes:
          "Lines with status 'unchecked' are as the 2019 map had them. 'confirmed' lines were checked on the date given. Minutes are estimates.",
        generated_at: new Date().toISOString(),
        stops,
        lines,
        line_stops: lineStops.filter((ls) => visible.has(ls.line_id)),
      },
      {
        headers: {
          "Content-Disposition": 'inline; filename="aduro-accra-trotro.json"',
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "The route map is not loaded yet." }, { status: 503 });
  }
}
