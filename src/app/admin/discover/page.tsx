import { createClient } from "@/lib/supabase/server";
import { Discover } from "@/components/admin/Discover";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Ask Google what is in a neighbourhood, then triage it into the catalogue. */
export default async function AdminDiscoverPage() {
  const supabase = createClient();
  const { data: areas } = await supabase.from("areas").select("*").order("name");

  return <Discover areas={(areas ?? []) as Area[]} />;
}
