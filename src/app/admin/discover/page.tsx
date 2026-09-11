import { adminDataClient } from "@/lib/adminAuth";
import { Discover } from "@/components/admin/Discover";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Ask Google what is in a neighbourhood, then triage it into the catalogue. */
export default async function AdminDiscoverPage() {
  const supabase = await adminDataClient();
  const { data: areas } = await supabase.from("areas").select("*").order("name");

  return <Discover areas={(areas ?? []) as Area[]} />;
}
