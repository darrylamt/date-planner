import { adminDataClient } from "@/lib/adminAuth";
import { CsvImporter } from "@/components/admin/CsvImporter";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const supabase = await adminDataClient();
  const [{ data: areas }, { data: venues }] = await Promise.all([
    supabase.from("areas").select("*").order("name"),
    supabase.from("venues").select("id, name, lat, lng, phone, phone_pending").order("name"),
  ]);

  /*
   * Whether each venue already has a pin and a number, so a research import
   * fills only the gaps. Presence only: the unapproved number itself stays on
   * the server, as it does everywhere else (see migration 0014).
   */
  const list = (venues ?? []).map((v: Record<string, unknown>) => ({
    id: v.id as string,
    name: v.name as string,
    hasPin: v.lat != null && v.lng != null,
    hasPhone: Boolean(v.phone || v.phone_pending),
  }));

  return <CsvImporter areas={(areas ?? []) as Area[]} venues={list} />;
}
