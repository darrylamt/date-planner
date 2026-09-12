import type { SupabaseClient } from "@supabase/supabase-js";
import type { AreaForMatch } from "./places";

/**
 * Where each area actually is, averaged from the venues already filed under it.
 *
 * The areas table holds a name and a city and no coordinates, which was fine
 * while a human picked the area from a list. It stops being fine the moment
 * Google is asked where a place is, because Google answers in sub-metro
 * districts: Cypher Zone in Labone and Bliss at Airport come back as the same
 * "Kpeshie" though they are four kilometres apart.
 *
 * The venues themselves already carry coordinates, so the catalogue knows the
 * answer without a new column: the middle of the places we have filed under
 * "Labone" is, near enough, Labone. Derived rather than stored so it improves
 * on its own as venues are added, and so there is no second copy of the truth
 * to drift.
 */
export async function areaCentroids(supabase: SupabaseClient): Promise<AreaForMatch[]> {
  const [{ data: areas }, { data: venues }] = await Promise.all([
    supabase.from("areas").select("id, name").order("name"),
    supabase
      .from("venues")
      .select("area_id, lat, lng")
      .not("lat", "is", null)
      .not("lng", "is", null),
  ]);

  const sums = new Map<string, { lat: number; lng: number; n: number }>();
  for (const v of venues ?? []) {
    const row = v as { area_id: string | null; lat: number | null; lng: number | null };
    if (!row.area_id || row.lat == null || row.lng == null) continue;
    const cur = sums.get(row.area_id) ?? { lat: 0, lng: 0, n: 0 };
    cur.lat += Number(row.lat);
    cur.lng += Number(row.lng);
    cur.n += 1;
    sums.set(row.area_id, cur);
  }

  return (areas ?? []).map((a) => {
    const row = a as { id: string; name: string };
    const sum = sums.get(row.id);
    return {
      id: row.id,
      name: row.name,
      // An area with no located venue yet has no centre, and is skipped by the
      // distance match rather than being given a fabricated one at 0,0.
      lat: sum ? sum.lat / sum.n : null,
      lng: sum ? sum.lng / sum.n : null,
    };
  });
}
