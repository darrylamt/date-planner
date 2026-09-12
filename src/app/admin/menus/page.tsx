import { adminDataClient } from "@/lib/adminAuth";
import { ThinMenus } from "@/components/admin/ThinMenus";

export const dynamic = "force-dynamic";

/**
 * Places people eat, ranked by how little of their menu we hold.
 *
 * This queue exists because of a plan that ordered a birthday table of seven
 * four vegetarian stews. The planner was behaving correctly: The Buka
 * Restaurant has exactly four dishes on file and every one of them is
 * vegetarian, so a spread across its whole menu is still a spread of stews.
 *
 * A thin menu is worse than no menu. A venue with nothing priced is withheld
 * from planning outright and shows up under Unpriced. A venue with four dishes
 * looks complete, passes every check, and quietly serves the same four dishes
 * to everybody who is ever sent there.
 */
export default async function AdminMenusPage() {
  const supabase = await adminDataClient();

  const [{ data: venues }, { data: items }] = await Promise.all([
    supabase
      .from("venues")
      .select("id, name, type, is_active, cuisine, areas(name)")
      .eq("is_active", true)
      .in("type", ["restaurant", "cafe"])
      .order("name"),
    supabase.from("menu_items").select("venue_id, category"),
  ]);

  const counts = new Map<string, Record<string, number>>();
  for (const it of items ?? []) {
    const row = it as { venue_id: string; category: string };
    const bucket = counts.get(row.venue_id) ?? {};
    bucket[row.category] = (bucket[row.category] ?? 0) + 1;
    counts.set(row.venue_id, bucket);
  }

  const rows = (venues ?? []).map((v: any) => {
    const bucket = counts.get(v.id) ?? {};
    const total = Object.values(bucket).reduce((s: number, n) => s + (n as number), 0);
    return {
      id: v.id,
      name: v.name,
      area: v.areas?.name ?? "no area",
      type: v.type,
      cuisine: (v.cuisine as string | null) ?? null,
      mains: bucket.main ?? 0,
      starters: bucket.starter ?? 0,
      desserts: bucket.dessert ?? 0,
      drinks: bucket.drink ?? 0,
      other: bucket.other ?? 0,
      total,
    };
  });

  // Thinnest first: this is a worklist, not a directory.
  rows.sort((a, b) => a.mains - b.mains || a.total - b.total || a.name.localeCompare(b.name));

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Menus</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        Restaurants and cafes, thinnest menu first. A plan orders a spread of up
        to four dishes, so a venue holding fewer than that serves everyone the
        same meal however big the group. The Buka has four mains on file and all
        four are vegetarian, which is exactly how a birthday table of seven was
        sent four vegetarian stews.
      </p>
      <ThinMenus rows={rows} />
    </div>
  );
}
