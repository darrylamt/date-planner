import { adminDataClient } from "@/lib/adminAuth";
import { menuStats } from "@/lib/menuStats";
import { MenuList, type MenuListRow } from "@/components/admin/MenuList";

export const dynamic = "force-dynamic";

/**
 * Menus: the desk for the menus role (0095), and for admins. Every live
 * venue, thinnest menu first, each opening its own editor.
 */
export default async function MenusDeskPage() {
  const supabase = await adminDataClient(["menus"]);
  const [{ data: venues }, stats] = await Promise.all([
    supabase.from("venues").select("id, name, type, menu_shared_from, avg_cost_per_person_ghs, is_free, areas(name)").eq("is_active", true).order("name"),
    menuStats(),
  ]);
  const rows: MenuListRow[] = ((venues ?? []) as any[]).map((v) => {
    const s = stats.get(v.menu_shared_from || v.id);
    return {
      id: v.id,
      name: v.name,
      area: v.areas?.name ?? "",
      type: v.type,
      items: s?.items ?? 0,
      drinks: s?.byCategory.drink ?? 0,
      shared: Boolean(v.menu_shared_from),
      updated: s?.latest ?? null,
      free: v.is_free === true,
    };
  });

  return (
    <div>
      <h1>Menus</h1>
      <p className="max-w-[680px] text-[14px] text-mutedbrown">
        Every dish with its real price, as the menu prints it. Read a photo of the menu to add many at once; check every
        line before saving. Venues with the fewest dishes are first.
      </p>
      <MenuList rows={rows} />
    </div>
  );
}
