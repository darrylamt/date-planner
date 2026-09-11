import { adminDataClient } from "@/lib/adminAuth";
import { CsvImporter } from "@/components/admin/CsvImporter";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const supabase = await adminDataClient();
  const [{ data: areas }, { data: venues }] = await Promise.all([
    supabase.from("areas").select("*").order("name"),
    supabase.from("venues").select("id, name").order("name"),
  ]);

  return (
    <CsvImporter
      areas={(areas ?? []) as Area[]}
      venues={(venues ?? []) as { id: string; name: string }[]}
    />
  );
}
