import { adminDataClient } from "@/lib/adminAuth";
import { IntercityRoutes } from "@/components/admin/IntercityRoutes";
import { CITY_CENTRES } from "@/lib/neighbourhoods";
import type { IntercityRoute } from "@/lib/trips";

export const dynamic = "force-dynamic";

/** Every way between towns for Trips (0101); ?town= opens it filtered, from a destination's page. */
export default async function AdminTripRoutesPage({ searchParams }: { searchParams: { town?: string } }) {
  const db = await adminDataClient(["stays"]);
  const [routes, dest] = await Promise.all([
    db.from("intercity_routes").select("*").order("to_town").order("operator").order("service"),
    db.from("destinations").select("gateway_town, town"),
  ]);

  if (routes.error) {
    return (
      <div className="max-w-[720px]">
        <h1>Ways to get there</h1>
        <div className="card mt-5 p-5 text-[14px]">
          Run migration <b>0101_trips.sql</b> first.
        </div>
      </div>
    );
  }

  const rows = (routes.data ?? []) as IntercityRoute[];
  // Towns to suggest: ours, every destination's, and every one already in a route.
  const towns = new Set<string>(Object.keys(CITY_CENTRES));
  for (const d of (dest.data ?? []) as { gateway_town: string; town: string | null }[]) {
    towns.add(d.gateway_town);
    if (d.town) towns.add(d.town);
  }
  for (const r of rows) towns.add(r.from_town).add(r.to_town);

  return <IntercityRoutes routes={rows} towns={[...towns].sort()} initialTown={searchParams.town ?? ""} />;
}
