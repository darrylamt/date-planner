import { adminDataClient } from "@/lib/adminAuth";
import { ThinMenus } from "@/components/admin/ThinMenus";
import { fetchAllRows } from "@/lib/fetchAll";

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

  const [{ data: venues }, items] = await Promise.all([
    supabase
      .from("venues")
      .select("id, name, type, is_active, cuisine, menu_shared_from, areas(name)")
      .eq("is_active", true)
      .in("type", ["restaurant", "cafe"])
      .order("name"),
    fetchAllRows<{ venue_id: string; category: string }>((from, to) =>
      supabase.from("menu_items").select("venue_id, category").range(from, to)
    ),
  ]);

  const counts = new Map<string, Record<string, number>>();
  for (const it of items) {
    const row = it as { venue_id: string; category: string };
    const bucket = counts.get(row.venue_id) ?? {};
    bucket[row.category] = (bucket[row.category] ?? 0) + 1;
    counts.set(row.venue_id, bucket);
  }

  /*
   * A branch is not thin because its menu lives on another row.
   *
   * The four Honeysuckle branches are priced from the Osu row, which holds 182
   * items, and this screen was counting items by venue_id alone: it read all
   * four as "No menu at all" and put them in a queue of work that does not
   * exist. Adding dishes to them would be the wrong fix and would undo the
   * sharing.
   */
  const nameById = new Map<string, string>(
    (venues ?? []).map((v: any) => [v.id as string, v.name as string])
  );

  const rows = (venues ?? []).map((v: any) => {
    const owner = (v.menu_shared_from as string | null) || v.id;
    const bucket = counts.get(owner) ?? {};
    const total = Object.values(bucket).reduce((s: number, n) => s + (n as number), 0);
    return {
      id: v.id,
      name: v.name,
      area: v.areas?.name ?? "no area",
      type: v.type,
      cuisine: (v.cuisine as string | null) ?? null,
      ...servedFrom(bucket),
      /*
       * Named rather than a flag, so the row says where the menu actually is.
       * "Shares Osu" tells you the price list to edit; "shared" would not.
       */
      sharedFrom: v.menu_shared_from ? (nameById.get(v.menu_shared_from) ?? "another branch") : null,
      mains: bucket.main ?? 0,
      starters: bucket.starter ?? 0,
      desserts: bucket.dessert ?? 0,
      drinks: bucket.drink ?? 0,
      other: bucket.other ?? 0,
      total,
    };
  });

  /*
   * Thinnest first by what the venue can actually serve, and branches with a
   * full menu are not thin. Sorting on mains alone put the four Honeysuckle
   * branches at the very top of a worklist they have no business being on,
   * and a boba shop below them.
   */
  rows.sort(
    (a, b) => a.serves - b.serves || a.total - b.total || a.name.localeCompare(b.name)
  );

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

/**
 * What the planner would actually order here, and how much choice it has.
 *
 * Mirrors planOrders. A restaurant is served a main, and failing that the
 * "other" bucket, then starters, and failing all three the cheapest thing on
 * the list whatever it is. Judging every venue on its main-course count asked
 * the wrong question of anywhere that does not serve main courses: Daddy boba
 * is a bubble tea shop with thirty two drinks and no food, and it was being
 * listed as needing work on a menu it is never going to have.
 *
 * The honest question is not "does it have mains" but "can it give a table of
 * six something other than six identical orders".
 */
function servedFrom(bucket: Record<string, number>): {
  serves: number;
  servesLabel: string;
  foodItems: number;
} {
  const food =
    (bucket.main ?? 0) + (bucket.starter ?? 0) + (bucket.dessert ?? 0) + (bucket.other ?? 0);

  for (const [key, label] of [
    ["main", "mains"],
    ["other", "items"],
    ["starter", "starters"],
    ["dessert", "desserts"],
    ["drink", "drinks"],
    ["activity", "activities"],
  ] as const) {
    if ((bucket[key] ?? 0) > 0) {
      return { serves: bucket[key] ?? 0, servesLabel: label, foodItems: food };
    }
  }
  return { serves: 0, servesLabel: "items", foodItems: food };
}
