import { createClient } from "@/lib/supabase/server";
import { UnpricedVenues } from "@/components/admin/UnpricedVenues";

export const dynamic = "force-dynamic";

/** Venues the planner is currently withholding because they have no price. */
export default async function AdminUnpricedPage() {
  const supabase = createClient();

  const { data: venues } = await supabase
    .from("venues")
    .select("id, name, type, avg_cost_per_person_ghs, areas(name), menu_items(id)")
    .eq("is_active", true)
    .order("name");

  const rows = (venues ?? [])
    .filter(
      (v: any) =>
        Number(v.avg_cost_per_person_ghs) <= 0 && (v.menu_items?.length ?? 0) === 0
    )
    .map((v: any) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      area: v.areas?.name ?? "—",
    }));

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Unpriced venues</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        Bowling, padel, sip and paint — places with no menu to itemise. They are
        withheld from planning until they have a price, because a venue with no
        price is unpriced, not free.
      </p>
      <UnpricedVenues rows={rows} />
    </div>
  );
}
