import { adminDataClient } from "@/lib/adminAuth";
import { PhoneReview } from "@/components/admin/PhoneReview";

export const dynamic = "force-dynamic";

/** Approval gate for the one field that gets dialled under our name. */
export default async function AdminPhonesPage() {
  const supabase = await adminDataClient();

  const [{ data: venues }, { data: collisions }] = await Promise.all([
    supabase
      .from("venues")
      .select(
        "id, name, phone, phone_pending, phone_status, phone_source, instagram_handle, google_maps_url, phone_report_count, phone_reported_at, areas(name)"
      )
      .order("name"),
    supabase.from("venue_phone_collisions").select("*"),
  ]);

  const rows = (venues ?? []).map((v: any) => ({
    id: v.id,
    name: v.name,
    area: v.areas?.name ?? ", ",
    phone: v.phone,
    phone_pending: v.phone_pending,
    phone_status: v.phone_status,
    phone_source: v.phone_source,
    instagram_handle: v.instagram_handle,
    google_maps_url: v.google_maps_url,
    phone_report_count: v.phone_report_count ?? 0,
    phone_reported_at: v.phone_reported_at,
  }));

  // Reported numbers first: a live number someone has questioned is the most
  // urgent thing on this page.
  const pending = rows
    .filter((r) => r.phone_status === "pending" && r.phone_pending)
    .sort((a, b) => b.phone_report_count - a.phone_report_count);
  const approved = rows
    .filter((r) => r.phone_status === "approved" && r.phone)
    .sort((a, b) => b.phone_report_count - a.phone_report_count);

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Phone review</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        A number here gets dialled by a real person over WhatsApp with a message
        signed &ldquo;sent via aduro&rdquo;. Scammers create fake listings and edit
        real ones to swap their own number in, so nothing goes live automatically, an import, the menu reader and the verifier can only ever propose.
      </p>
      <PhoneReview
        pending={pending}
        approved={approved}
        collisions={(collisions ?? []) as any}
      />
    </div>
  );
}
