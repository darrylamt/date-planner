import { createClient } from "@/lib/supabase/server";
import { requireVendor } from "@/lib/vendorAuth";
import { VendorShell } from "@/components/vendor/VendorShell";
import { VendorDetails } from "@/components/vendor/VendorDetails";

export default async function VendorDetailsPage() {
  const session = await requireVendor();
  const { data: areas } = await createClient().from("areas").select("id, name").order("name");
  return (
    <VendorShell name={session.vendor.name} logoUrl={session.vendor.image_url}>
      <h1 className="pl-up mb-6 text-[30px] font-bold leading-tight md:text-[36px]">Details</h1>
      <VendorDetails vendor={session.vendor} areas={(areas ?? []) as { id: string; name: string }[]} username={session.username} />
    </VendorShell>
  );
}
