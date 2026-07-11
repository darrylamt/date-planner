import { createClient } from "@/lib/supabase/server";
import { AreasManager } from "@/components/admin/AreasManager";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminAreasPage() {
  const supabase = createClient();
  const { data } = await supabase.from("areas").select("*").order("name");
  return <AreasManager areas={(data ?? []) as Area[]} />;
}
