import { adminDataClient } from "@/lib/adminAuth";
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

  return (
    <GettingAroundManager
      stations={(stations.data ?? []) as TrotroStation[]}
      routes={(routes.data ?? []) as TrotroRoute[]}
      access={(access.data ?? []) as VenueAccess[]}
      rentals={(rentals.data ?? []) as CarRental[]}
      areas={(areas.data ?? []) as Area[]}
      venues={(venues.data ?? []) as AccessVenue[]}
    />
  );
}
