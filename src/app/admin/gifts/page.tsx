import { adminDataClient } from "@/lib/adminAuth";
import { GiftsManager } from "@/components/admin/GiftsManager";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Florists and bakers, and what they sell.
 *
 * Kept apart from venues because a pickup is not a stop: it has products,
 * sizes and a lead time, and none of a venue's fields (party size, pricing
 * mode, vibe tags) mean anything for a bunch of roses.
 */
export default async function AdminGiftsPage() {
  const supabase = await adminDataClient();

  const [{ data: areas }, { data: vendors }] = await Promise.all([
    supabase.from("areas").select("*").order("name"),
    supabase
      .from("gift_vendors")
      .select(
        "id, name, kind, address, phone, lead_time_hours, is_active, area_id, areas(name), " +
          "gift_products(id, name, description, image_url, is_active, sort_order, " +
          "gift_variants(id, label, price_ghs, magnitude, is_active, sort_order))"
      )
      .order("name"),
  ]);

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Flowers and cakes</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        What people can collect on the way to a plan. A photograph matters more than
        the name here, since nobody picks flowers off a list. Lead time is what stops
        a two-day cake being offered for tonight.
      </p>
      <GiftsManager
        areas={(areas ?? []) as Area[]}
        vendors={(vendors ?? []) as never[]}
      />
    </div>
  );
}
