import { adminDataClient } from "@/lib/adminAuth";
import { VendorAdmin, type Application, type VendorListRow } from "@/components/admin/VendorAdmin";

export const dynamic = "force-dynamic";

export default async function AdminVendorsPage() {
  const supabase = await adminDataClient();
  const [{ data: apps }, { data: vendors }, { data: logins }, { data: products }] = await Promise.all([
    supabase.from("vendor_applications").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("gift_vendors").select("id, name, kind, is_active").order("name"),
    supabase.from("vendor_users").select("user_id, vendor_id, username"),
    supabase.from("gift_products").select("vendor_id").eq("is_active", true),
  ]);

  const login = new Map(((logins ?? []) as { user_id: string; vendor_id: string; username: string }[]).map((l) => [l.vendor_id, l]));
  const productCount = new Map<string, number>();
  for (const p of (products ?? []) as { vendor_id: string }[]) productCount.set(p.vendor_id, (productCount.get(p.vendor_id) ?? 0) + 1);

  const rows: VendorListRow[] = ((vendors ?? []) as { id: string; name: string; kind: "cake" | "flowers"; is_active: boolean }[]).map((v) => ({
    ...v,
    username: login.get(v.id)?.username ?? null,
    userId: login.get(v.id)?.user_id ?? null,
    products: productCount.get(v.id) ?? 0,
  }));

  return <VendorAdmin applications={(apps ?? []) as Application[]} vendors={rows} />;
}
