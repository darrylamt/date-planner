import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The gate for /vendor: a cake or flower vendor's own listing (0078).
 *
 * On the vendor's own session, so the policies decide what they can reach:
 * their own vendor row, its products and its sizes, and nothing else.
 */

export interface VendorRow {
  id: string;
  name: string;
  kind: "flowers" | "cake";
  area_id: string | null;
  address: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  instagram_handle: string | null;
  google_maps_url: string | null;
  image_url: string | null;
  lead_time_hours: number;
  is_active: boolean;
}

export interface VendorSession {
  userId: string;
  username: string;
  vendor: VendorRow;
}

export async function requireVendor(): Promise<VendorSession> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/vendor/login");

  const { data: link } = await supabase.from("vendor_users").select("vendor_id, username").eq("user_id", user.id).maybeSingle();
  if (!link) redirect("/vendor/login?as=not-a-vendor");

  const { data: vendor } = await supabase
    .from("gift_vendors")
    .select("id, name, kind, area_id, address, phone, whatsapp_phone, instagram_handle, google_maps_url, image_url, lead_time_hours, is_active")
    .eq("id", (link as { vendor_id: string }).vendor_id)
    .maybeSingle();
  if (!vendor) redirect("/vendor/login?as=not-a-vendor");

  return { userId: user.id, username: (link as { username: string }).username, vendor: vendor as VendorRow };
}
