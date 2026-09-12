import { adminDataClient } from "@/lib/adminAuth";
import { VenueForm } from "@/components/admin/VenueForm";
import { areaCentroids } from "@/lib/areaCentroids";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewVenuePage() {
  const supabase = await adminDataClient();
  const [{ data }, centroids] = await Promise.all([
    supabase.from("areas").select("*").order("name"),
    areaCentroids(supabase),
  ]);
  return (
    <VenueForm
      areas={(data ?? []) as Area[]}
      areaCentres={centroids}
      venue={null}
      menuItems={[]}
    />
  );
}
