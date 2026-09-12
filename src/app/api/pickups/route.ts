import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { giftsForOccasion, vendorCanDeliver } from "@/lib/pickups";
import type { Occasion } from "@/lib/types";

/**
 * What can be collected on the way to this plan.
 *
 * Public, because plans are built signed out and the catalogue is a shop
 * window. Filtered by two things before it leaves the server: whether the
 * occasion wants that kind of gift at all, and whether the vendor could
 * actually have it ready by the time the evening starts.
 *
 * The second filter is the important one. Showing a cake that needs two days
 * for an evening three hours away is the app arranging something that cannot
 * happen, and doing it on the client would mean every caller had to remember
 * the rule.
 */
export const maxDuration = 15;

const querySchema = z.object({
  occasion: z.string().min(2).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  let query: z.infer<typeof querySchema>;
  try {
    query = querySchema.parse({
      occasion: url.searchParams.get("occasion"),
      date: url.searchParams.get("date"),
      startTime: url.searchParams.get("startTime"),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const kinds = giftsForOccasion(query.occasion as Occasion);
  if (!kinds.length) return NextResponse.json({ vendors: [] });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("gift_vendors")
    .select(
      "id, name, kind, address, lead_time_hours, google_maps_url, areas(name), " +
        "gift_products(id, vendor_id, name, description, image_url, sort_order, is_active, " +
        "gift_variants(id, label, price_ghs, magnitude, sort_order, is_active))"
    )
    .eq("is_active", true)
    .in("kind", kinds);

  if (error) {
    console.error("pickup catalogue failed", error);
    return NextResponse.json({ error: "Could not load pickups." }, { status: 500 });
  }

  const vendors = (data ?? [])
    .filter((v: any) => vendorCanDeliver(v.lead_time_hours, query.date, query.startTime))
    .map((v: any) => ({
      id: v.id,
      name: v.name,
      kind: v.kind,
      area: v.areas?.name ?? null,
      address: v.address,
      lead_time_hours: v.lead_time_hours,
      google_maps_url: v.google_maps_url,
      products: (v.gift_products ?? [])
        .filter((p: any) => p.is_active)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((p: any) => ({
          id: p.id,
          vendor_id: p.vendor_id,
          name: p.name,
          description: p.description,
          image_url: p.image_url,
          variants: (p.gift_variants ?? [])
            .filter((x: any) => x.is_active)
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((x: any) => ({
              id: x.id,
              label: x.label,
              price_ghs: Number(x.price_ghs),
              magnitude: x.magnitude,
            })),
        }))
        // A product with no price is a photograph, not something to sell.
        .filter((p: any) => p.variants.length),
    }))
    .filter((v: any) => v.products.length);

  /*
   * Ordered by kind so the occasion's first choice leads: a birthday opens on
   * cakes, a first date on flowers.
   */
  vendors.sort((a: any, b: any) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));

  return NextResponse.json({ vendors });
}
