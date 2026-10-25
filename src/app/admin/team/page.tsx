import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { STAFF_ROLES, type StaffRole } from "@/lib/staff";
import { TeamManager, type StaffMember } from "@/components/admin/TeamManager";

export const dynamic = "force-dynamic";

/**
 * Team: staff logins with one job each (0095). Make one, choose what it may
 * do, hand over the username and password; see what each person has done.
 */
export default async function TeamPage() {
  const supabase = await adminDataClient();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();

  const [{ data: roles, error }, { data: edits }] = await Promise.all([
    supabase.from("staff_roles").select("user_id, role, username, created_at"),
    supabase.from("staff_edits").select("user_id, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
  ]);

  if (error) {
    return (
      <div>
        <h1>Team</h1>
        <div className="why mt-4">Staff logins need migration 0095. Run it in the Supabase SQL editor, then come back.</div>
      </div>
    );
  }

  const byUser = new Map<string, StaffMember>();
  for (const r of (roles ?? []) as { user_id: string; role: StaffRole; username: string | null; created_at: string }[]) {
    const m = byUser.get(r.user_id) ?? { userId: r.user_id, username: r.username ?? "?", roles: [], since: r.created_at, week: 0, last: null };
    if ((STAFF_ROLES as readonly string[]).includes(r.role)) m.roles.push(r.role);
    if (r.created_at < m.since) m.since = r.created_at;
    byUser.set(r.user_id, m);
  }
  for (const e of (edits ?? []) as { user_id: string; created_at: string }[]) {
    const m = byUser.get(e.user_id);
    if (!m) continue;
    m.week += 1;
    if (!m.last) m.last = e.created_at;
  }
  const members = [...byUser.values()].sort((a, b) => a.username.localeCompare(b.username));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Team</h1>
          <p className="max-w-[680px] text-[14px] text-mutedbrown">
            Logins for people who do one job: photos, menus or events. They see only their pages, and the database refuses
            anything else. Every change they make is in the activity log.
          </p>
        </div>
        <Link href="/admin/team/activity" className="btn2 btnsm">
          Activity log
        </Link>
      </div>
      <TeamManager members={members} />
    </div>
  );
}
