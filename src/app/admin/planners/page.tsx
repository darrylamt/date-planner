import { adminDataClient } from "@/lib/adminAuth";
import { PlannerLogins, type PlannerRow } from "@/components/admin/PlannerLogins";

export const dynamic = "force-dynamic";

export default async function AdminPlannersPage() {
  const supabase = await adminDataClient();

  const [{ data: planners }, { data: links }] = await Promise.all([
    supabase
      .from("event_planners")
      .select("user_id, username, display_name, contact_phone, is_active, created_at")
      .order("created_at", { ascending: false }),
    /*
     * Counted here rather than joined, because a planner's locations are
     * ordinary venue_users rows and a join through them would also pick up
     * any venue an admin had assigned to the same account by hand. Counting
     * the link rows is the honest answer to "what does this account reach".
     */
    supabase.from("venue_users").select("user_id"),
  ]);

  const counts = new Map<string, number>();
  for (const l of (links ?? []) as { user_id: string }[]) {
    counts.set(l.user_id, (counts.get(l.user_id) ?? 0) + 1);
  }

  const rows: PlannerRow[] = ((planners ?? []) as Record<string, unknown>[]).map((p) => ({
    user_id: p.user_id as string,
    username: p.username as string,
    display_name: p.display_name as string,
    contact_phone: (p.contact_phone as string | null) ?? null,
    is_active: p.is_active as boolean,
    created_at: p.created_at as string,
    locations: counts.get(p.user_id as string) ?? 0,
  }));

  return <PlannerLogins rows={rows} />;
}
