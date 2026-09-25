import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { GettingThere, type PlaceOption } from "@/components/transit/GettingThere";
import type { CarRental, TrotroStation, VenueAccess } from "@/lib/transit";

export const dynamic = "force-dynamic";

// A test page, not a public one yet: kept out of search until it has earned it.
export const metadata: Metadata = {
  title: "Getting there, aduro",
  robots: { index: false, follow: false },
};

/**
 * The "how do I get there" preview.
 *
 * Everything the app will eventually show on a stop, laid out at phone width
 * so it can be tried and judged before a line of it goes into the app. Reads
 * with the ordinary public client, so it sees exactly what a signed-out
 * visitor would: hidden stations and routes stay hidden here too.
 */
export default async function GettingTherePage({
  searchParams,
}: {
  searchParams: { venue?: string };
}) {
  const supabase = createClient();
  const [stations, lines, access, rentals, venues] = await Promise.all([
    supabase.from("trotro_stations").select("*").eq("is_active", true).order("name"),
    // Only to tell whether the route map is loaded; the planner reads it itself.
    supabase.from("trotro_lines").select("id", { count: "exact", head: true }),
    supabase.from("venue_access").select("*"),
    supabase.from("car_rentals").select("*").eq("is_active", true).order("name"),
    supabase.from("venues").select("id, name, lat, lng, areas(name)").eq("is_active", true).order("name"),
  ]);

  const notReady = [stations, lines, access, rentals].some((r) => r.error) || !lines.count;

  const places: PlaceOption[] = (venues.data ?? []).map((v: Record<string, unknown>) => ({
    id: v.id as string,
    name: v.name as string,
    area: ((v.areas as { name: string } | null)?.name ?? null) as string | null,
    lat: v.lat == null ? null : Number(v.lat),
    lng: v.lng == null ? null : Number(v.lng),
  }));

  return (
    <GettingThere
      notReady={notReady}
      places={places}
      stations={(stations.data ?? []) as TrotroStation[]}
      access={(access.data ?? []) as VenueAccess[]}
      rentals={(rentals.data ?? []) as CarRental[]}
      initialVenue={searchParams.venue ?? null}
    />
  );
}
