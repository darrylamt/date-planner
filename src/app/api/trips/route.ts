import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { photoCredit, routesTo, type Destination, type IntercityRoute } from "@/lib/trips";

/**
 * Where a trip can go and the ways there (0101), for the redesigned app's
 * Trips. Public, cached at the edge, and read as the server because the
 * tables have no public policy. Stays are not here yet: they stay hidden
 * until Trips is built (0099).
 */
export const revalidate = 600;

export async function GET() {
  try {
    const db = createServiceClient();
    const [dest, routes] = await Promise.all([
      db.from("destinations").select("*").eq("is_active", true).order("sort").order("name"),
      db.from("intercity_routes").select("*").eq("is_active", true).order("fare_min_ghs", { nullsFirst: false }),
    ]);
    // Before 0101 runs the app keeps its sample destinations: an empty list, not an error.
    if (dest.error || routes.error) return NextResponse.json({ destinations: [] });

    const all = (routes.data ?? []) as IntercityRoute[];
    const destinations = ((dest.data ?? []) as Destination[]).map((d) => ({
      slug: d.slug,
      name: d.name,
      region: d.region,
      town: d.town,
      gatewayTown: d.gateway_town,
      lastLeg: d.last_leg,
      lat: d.lat,
      lng: d.lng,
      roadKmFromAccra: d.road_km_from_accra,
      blurb: d.blurb,
      highlights: d.highlights,
      bestTime: d.best_time,
      image: d.hero_image,
      imageCredit: photoCredit(d),
      routes: routesTo(d, all).map((r) => ({
        id: r.id,
        from: r.from_town,
        to: r.to_town,
        bothWays: r.both_ways,
        mode: r.mode,
        operator: r.operator,
        service: r.service || null,
        fromStation: r.from_station,
        toStation: r.to_station,
        departures: r.departures,
        minutes: r.duration_mins,
        fareMin: r.fare_min_ghs == null ? null : Number(r.fare_min_ghs),
        fareMax: r.fare_max_ghs == null ? null : Number(r.fare_max_ghs),
        bookUrl: r.book_url,
        bookPhone: r.book_phone,
        checkedOn: r.checked_on,
        notes: r.notes,
      })),
    }));
    return NextResponse.json({ destinations }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" } });
  } catch (e) {
    console.error("trips list failed", e);
    return NextResponse.json({ error: "Could not list destinations." }, { status: 500 });
  }
}
