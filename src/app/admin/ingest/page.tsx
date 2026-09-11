import { adminDataClient } from "@/lib/adminAuth";
import { MenuIngest } from "@/components/admin/MenuIngest";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Menu photo or link in, reviewed migration out. */
export default async function AdminIngestPage() {
  const supabase = await adminDataClient();
  const { data: areas } = await supabase.from("areas").select("id, name, city").order("name");

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Add a venue from its menu</h1>
      <p className="mt-1 max-w-[640px] text-[14px] text-mutedbrown">
        Give a name, an area and either a menu link or photos of the menu. The
        model reads it and produces a migration for you to run in Supabase.
        Everything is editable first, and nothing is written to the database
        from this screen.
      </p>
      <MenuIngest areas={(areas ?? []) as Area[]} />
    </div>
  );
}
