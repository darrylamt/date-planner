import { adminDataClient } from "@/lib/adminAuth";
import { UnpricedVenues } from "@/components/admin/UnpricedVenues";

export const dynamic = "force-dynamic";

/** Venues the planner is currently withholding because they have no price. */
export default async function AdminUnpricedPage() {
  const supabase = await adminDataClient();

  const { data: venues } = await supabase
    .from("venues")
    .select(
      "id, name, type, is_free, menu_shared_from, avg_cost_per_person_ghs, areas(name), menu_items(id)"
    )
    .eq("is_active", true)
    .order("name");

  /*
   * A branch is not unpriced because its menu lives on another row, and a
   * venue that genuinely costs nothing is not unpriced either.
   *
   * The embed only ever counts items under the venue's own id, so all eight
   * branches in the catalogue were listed here asking for a price that already
   * exists on the row they share from, and taking that offer is how the
   * sharing gets undone. Free venues were listed too, which is a claim the
   * is_free flag has already answered.
   */
  const ownIds = new Set(
    (venues ?? []).filter((v: any) => (v.menu_items?.length ?? 0) > 0).map((v: any) => v.id)
  );

  const rows = (venues ?? [])
    .filter((v: any) => {
      if (v.is_free === true) return false;
      if (Number(v.avg_cost_per_person_ghs) > 0) return false;
      return !ownIds.has((v.menu_shared_from as string | null) || v.id);
    })
    .map((v: any) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      area: v.areas?.name ?? "no area",
    }));

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Unpriced venues</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        Bowling, padel, sip and paint, places with no menu to itemise. They are
        withheld from planning until they have a price, because a venue with no
        price is unpriced, not free.
      </p>
      <UnpricedVenues rows={rows} />
    </div>
  );
}
