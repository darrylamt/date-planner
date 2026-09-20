import { adminDataClient } from "@/lib/adminAuth";
import { IssuesReview, type IssueRow } from "@/components/admin/IssuesReview";

export const dynamic = "force-dynamic";

/**
 * What people say is broken about aduro itself.
 *
 * /admin/reports is the catalogue going stale: a price moved, a door was
 * locked. This is the app being wrong, which until migration 0052 had nowhere
 * to land. Chat spent an unknown stretch telling paying subscribers they were
 * out of messages for the month, and it was found only because the person who
 * runs aduro hit it himself -- everyone else got a screen that said no and no
 * way to argue with it.
 */
export default async function AdminIssuesPage() {
  const supabase = await adminDataClient();

  const { data, error } = await supabase
    .from("issue_reports")
    .select("id, area, message, context, reporter_id, reporter_device, created_at")
    .eq("status", "open")
    // Oldest first: see IssuesReview. A newest-first queue starves the report
    // that has been waiting longest, which is the one already costing goodwill.
    .order("created_at", { ascending: true });

  /*
   * A database without 0052 shows the empty state rather than a crash, the
   * same tolerance adminCounts applies. The page telling you what needs doing
   * is the worst one to take down over a migration that has not run.
   */
  if (error) {
    return (
      <div>
        <h1 className="font-display text-[24px] font-bold">Problem reports</h1>
        <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
          This queue needs migration 0052. Run it and reports will start arriving here.
        </p>
      </div>
    );
  }

  const reporters = [
    ...new Set((data ?? []).map((r: any) => r.reporter_id).filter(Boolean)),
  ] as string[];

  const emails = new Map<string, string>();
  if (reporters.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", reporters);
    for (const p of (profiles ?? []) as { id: string; email: string | null }[]) {
      if (p.email) emails.set(p.id, p.email);
    }
  }

  const rows: IssueRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    area: r.area,
    message: r.message,
    context: r.context ?? null,
    reporter_email: r.reporter_id ? (emails.get(r.reporter_id) ?? null) : null,
    reporter_device: r.reporter_device ?? null,
    created_at: r.created_at,
  }));

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Problem reports</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        Things people say are broken in the app, as opposed to wrong in the catalogue.
        Each one is somebody who was stopped by something and took the trouble to say so.
      </p>
      <IssuesReview rows={rows} />
    </div>
  );
}
