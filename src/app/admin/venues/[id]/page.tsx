import { notFound } from "next/navigation";
import { adminDataClient } from "@/lib/adminAuth";
import { VenueForm } from "@/components/admin/VenueForm";
import { areaCentroids } from "@/lib/areaCentroids";
import type { Area, MenuItem, Venue, VenueSchedule } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditVenuePage({ params }: { params: { id: string } }) {
  const supabase = await adminDataClient();
  const [{ data: areas }, { data: venue }, { data: items }, { data: fixtures }, centroids] =
    await Promise.all([
      supabase.from("areas").select("*").order("name"),
      supabase.from("venues").select("*").eq("id", params.id).maybeSingle(),
      supabase.from("menu_items").select("*").eq("venue_id", params.id).order("category"),
      supabase
        .from("venue_schedules")
        .select("*")
        .eq("venue_id", params.id)
        .order("weekday")
        .order("starts_minute"),
      areaCentroids(supabase),
    ]);

  if (!venue) notFound();


  /*
   * Who a branch may borrow a menu from.
   *
   * Only venues that own their menu: migration 0024 keeps sharing exactly one
   * level deep with a trigger, so pointing at a venue that is itself
   * borrowing would be rejected on save. Filtering here means the choice is
   * never offered rather than offered and refused.
   */
  const { data: ownerRows } = await supabase
    .from("venues")
    .select("id, name, menu_shared_from, areas(name)")
    .eq("is_active", true)
    .is("menu_shared_from", null)
    .order("name");

  const menuOwners = ((ownerRows ?? []) as Record<string, unknown>[])
    .filter((o) => o.id !== params.id)
    .map((o) => ({
      id: o.id as string,
      name: o.name as string,
      area: ((o.areas as { name?: string } | null)?.name ?? "") as string,
    }));

  return (
    <VenueForm
      areas={(areas ?? []) as Area[]}
      areaCentres={centroids}
      menuOwners={menuOwners}
      venue={venue as Venue}
      menuItems={(items ?? []) as MenuItem[]}
      schedules={(fixtures ?? []) as VenueSchedule[]}
    />
  );
}
