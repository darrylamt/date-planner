import { adminDataClient } from "@/lib/adminAuth";
import { KitchenEditor } from "@/components/admin/KitchenEditor";

export const dynamic = "force-dynamic";

/**
 * Recording what kind of food each place serves.
 *
 * Only the venues somebody eats or drinks at. An arcade has no kitchen and
 * putting it on this list would be a hundred rows of noise around the work.
 */
export default async function KitchensPage() {
  const supabase = await adminDataClient();

  const { data } = await supabase
    .from("venues")
    .select("id, name, type, cuisine, cuisines, areas(name)")
    .eq("is_active", true)
    .in("type", ["restaurant", "cafe", "lounge", "dessert"])
    .order("name");

  const rows = ((data ?? []) as unknown as {
    id: string;
    name: string;
    type: string;
    cuisine: string | null;
    cuisines: string[] | null;
    areas: { name: string } | null;
  }[]).map((v) => ({
    id: v.id,
    name: v.name,
    type: v.type,
    cuisine: v.cuisine,
    cuisines: v.cuisines ?? [],
    area: v.areas?.name ?? "",
  }));

  return <KitchenEditor rows={rows} />;
}
