import { notFound } from "next/navigation";
import { adminDataClient } from "@/lib/adminAuth";
import { VenueForm } from "@/components/admin/VenueForm";
import { areaCentroids } from "@/lib/areaCentroids";
import type { Area, MenuItem, Venue } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditVenuePage({ params }: { params: { id: string } }) {
  const supabase = await adminDataClient();
  const [{ data: areas }, { data: venue }, { data: items }, centroids] = await Promise.all([
    supabase.from("areas").select("*").order("name"),
    supabase.from("venues").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("menu_items").select("*").eq("venue_id", params.id).order("category"),
    areaCentroids(supabase),
  ]);

  if (!venue) notFound();

  return (
    <VenueForm
      areas={(areas ?? []) as Area[]}
      areaCentres={centroids}
      venue={venue as Venue}
      menuItems={(items ?? []) as MenuItem[]}
    />
  );
}
