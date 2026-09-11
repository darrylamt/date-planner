import { adminDataClient } from "@/lib/adminAuth";
import { VenueForm } from "@/components/admin/VenueForm";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewVenuePage() {
  const supabase = await adminDataClient();
  const { data } = await supabase.from("areas").select("*").order("name");
  return <VenueForm areas={(data ?? []) as Area[]} venue={null} menuItems={[]} />;
}
