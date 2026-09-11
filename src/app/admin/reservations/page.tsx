import { adminDataClient } from "@/lib/adminAuth";
import { ReservationsManager } from "@/components/admin/ReservationsManager";
import type { ReservationRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminReservationsPage() {
  const supabase = await adminDataClient();
  const { data: reservations } = await supabase
    .from("reservation_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return <ReservationsManager reservations={(reservations ?? []) as ReservationRequest[]} />;
}
