import { createClient } from "@/lib/supabase/server";
import { requireVendor } from "@/lib/vendorAuth";
import { VendorShell } from "@/components/vendor/VendorShell";
import { ProductsManager, type Product } from "@/components/vendor/ProductsManager";

/** Home: what they sell, as it shows in people's plans. */
export default async function VendorHome() {
  const session = await requireVendor();
  const { vendor } = session;
  const { data } = await createClient()
    .from("gift_products")
    .select("id, name, description, image_url, is_active, sort_order, gift_variants(id, label, price_ghs, is_active, sort_order)")
    .eq("vendor_id", vendor.id)
    .order("sort_order");

  const products: Product[] = ((data ?? []) as unknown as (Omit<Product, "sizes"> & {
    gift_variants: { id: string; label: string; price_ghs: number; is_active: boolean; sort_order: number }[];
  })[]).map((p) => ({
    ...p,
    sizes: [...(p.gift_variants ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((v) => ({ ...v, price_ghs: Number(v.price_ghs) })),
  }));

  return (
    <VendorShell name={vendor.name} logoUrl={vendor.image_url}>
      <div className="pl-up mb-6">
        <p className="text-[15px] font-semibold text-[var(--p-muted)]">{vendor.name}</p>
        <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">Your {vendor.kind === "cake" ? "cakes" : "flowers"}</h1>
        <p className="mt-1 text-[15px] text-[var(--p-muted)]">
          {vendor.is_active
            ? `People planning ${vendor.kind === "cake" ? "birthdays and celebrations" : "dates, birthdays and anniversaries"} can add these to their plan and come to you.`
            : "You are hidden from plans right now. Switch it back on under Details."}
        </p>
      </div>
      <ProductsManager vendorId={vendor.id} kind={vendor.kind} products={products} />
    </VendorShell>
  );
}
