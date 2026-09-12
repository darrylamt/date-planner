import { adminDataClient } from "@/lib/adminAuth";
import { AreasManager } from "@/components/admin/AreasManager";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Areas, and what is in each of them.
 *
 * The list used to be names and cities alone, which told you an area existed
 * and nothing about whether it was worth planning in. The planner groups stops
 * by area and routes taxis between them, so an area holding two venues
 * produces a thin evening however good those two are, and there was no screen
 * that would tell you which areas those were.
 */
export default async function AdminAreasPage() {
  const supabase = await adminDataClient();

  const [{ data: areas }, { data: venues }] = await Promise.all([
    supabase.from("areas").select("*").order("name"),
    supabase
      .from("venues")
      .select("id, name, type, area_id, is_active, is_free, avg_cost_per_person_ghs, menu_shared_from, menu_items(id)")
      .order("name"),
  ]);

  const byArea = new Map<string, AreaVenue[]>();
  for (const row of (venues ?? []) as VenueRow[]) {
    if (!row.area_id) continue;
    const list = byArea.get(row.area_id) ?? [];
    /*
     * "Plannable" is the same test the planner applies, so this screen agrees
     * with what actually happens rather than counting rows the planner
     * silently withholds. A branch priced from another venue counts as priced.
     */
    const ownMenu = (row.menu_items ?? []).length > 0;
    list.push({
      id: row.id,
      name: row.name,
      type: row.type,
      isActive: row.is_active,
      plannable:
        row.is_active &&
        (row.is_free ||
          Number(row.avg_cost_per_person_ghs) > 0 ||
          ownMenu ||
          Boolean(row.menu_shared_from)),
    });
    byArea.set(row.area_id, list);
  }

  return (
    <AreasManager
      areas={(areas ?? []) as Area[]}
      venuesByArea={Object.fromEntries(byArea)}
    />
  );
}

interface VenueRow {
  id: string;
  name: string;
  type: string;
  area_id: string | null;
  is_active: boolean;
  is_free: boolean;
  avg_cost_per_person_ghs: number;
  menu_shared_from: string | null;
  menu_items: { id: string }[] | null;
}

export interface AreaVenue {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  /** Whether the planner can actually use it, not merely whether it exists. */
  plannable: boolean;
}
