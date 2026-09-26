import { adminDataClient } from "@/lib/adminAuth";
import { UnpricedVenues } from "@/components/admin/UnpricedVenues";
import { isPlaceholderAvg } from "@/lib/budget";

export const dynamic = "force-dynamic";

/** Venues the planner is currently withholding because they have no price. */
export default async function AdminUnpricedPage() {
  const supabase = await adminDataClient();

  const { data: venues } = await supabase
    .from("venues")
    .select(
      "id, name, type, is_free, is_active, business_status, menu_shared_from, avg_cost_per_person_ghs, price_source, areas(name), menu_items(id)"
    )
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
      /*
       * Switched off for want of a price belongs here too, so the queue is
       * the one place every venue waiting on a price can be found. Closed is
       * different: no price brings back a place that has shut.
       */
      if (!v.is_active && String(v.business_status ?? "").startsWith("CLOSED")) return false;
      const hasMenu = ownIds.has((v.menu_shared_from as string | null) || v.id);
      // The GHS 100 import default counts as no price: see PLACEHOLDER_AVG_GHS.
      if (isPlaceholderAvg(v, hasMenu)) return true;
      if (Number(v.avg_cost_per_person_ghs) > 0) return false;
      return !hasMenu;
    })
    .map((v: any) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      area: v.areas?.name ?? "no area",
      inactive: !v.is_active,
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
