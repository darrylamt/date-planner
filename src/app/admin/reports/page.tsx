import { createClient } from "@/lib/supabase/server";
import { ReportsReview, type ReportRow } from "@/components/admin/ReportsReview";

export const dynamic = "force-dynamic";

/**
 * Open venue reports from people actually out using plans.
 *
 * Phone reports are included here as well as on the phone review page: that
 * page decides whether a number is dialable, this one shows that someone tried
 * it and it failed. They answer different questions about the same fact.
 */
export default async function AdminReportsPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("venue_reports")
    .select(
      "id, venue_id, report_type, note, suggested_price_ghs, rating, created_at, venues(name, is_active, avg_cost_per_person_ghs, pricing_mode, aesthetics, areas(name))"
    )
    .eq("status", "open")
    .order("created_at", { ascending: false });

  const rows: ReportRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    venue_id: r.venue_id,
    venue_name: r.venues?.name ?? "Unknown venue",
    area: r.venues?.areas?.name ?? "",
    report_type: r.report_type,
    note: r.note,
    suggested_price_ghs: r.suggested_price_ghs,
    rating: r.rating,
    current_aesthetics: r.venues?.aesthetics ?? null,
    created_at: r.created_at,
    current_price: r.venues?.avg_cost_per_person_ghs ?? null,
    pricing_mode: r.venues?.pricing_mode ?? "per_person",
    is_active: r.venues?.is_active ?? true,
  }));

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Reports</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        What people found when they got there. Nothing here has changed the catalog,
        every one of these is waiting on you.
      </p>
      <ReportsReview rows={rows} />
    </div>
  );
}
