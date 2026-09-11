import { adminDataClient } from "@/lib/adminAuth";
import { AreasManager } from "@/components/admin/AreasManager";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminAreasPage() {
  const supabase = await adminDataClient();
  const { data } = await supabase.from("areas").select("*").order("name");
  return <AreasManager areas={(data ?? []) as Area[]} />;
}
