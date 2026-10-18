import { createServiceClient } from "@/lib/supabase/server";
import { json, loadGroup, resolveMember } from "@/lib/groupServer";
import type { GroupMe, MemberOrder } from "@/lib/groups";

/**
 * A member's own view: their answer, their budget, and their own order.
 *
 * The one route that reads a budget back out, and only the caller's own:
 * every query here is filtered by the member the caller proved to be.
 */
export const maxDuration = 15;

export async function GET(req: Request, { params }: { params: { code: string } }) {
  const db = createServiceClient();
  const group = await loadGroup(db, params.code);
  if (!group || group.status === "cancelled") return json({ error: "not_found" }, 404);
  const { member } = await resolveMember(db, group, req);
  if (!member) return json({ error: "not_member" }, 403);

  const { data: secret } = await db
    .from("group_member_secrets")
    .select("budget_ghs")
    .eq("member_id", member.id)
    .maybeSingle();
  const budget = (secret?.budget_ghs as number | null | undefined) ?? null;

  // The locked plan, or for the organiser the current proposal.
  const { data: plan } = await db
    .from("group_plans")
    .select("id, attending_member_ids, status")
    .eq("group_id", group.id)
    .in("status", group.status === "locked" ? ["locked"] : ["proposed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const visible = plan && (plan.status === "locked" || member.is_organiser);

  let order: GroupMe["order"] = null;
  let attending: boolean | null = null;
  if (visible) {
    attending = (plan.attending_member_ids as string[]).includes(member.id);
    const { data: own } = await db
      .from("group_plan_orders")
      .select("stops, shared_ghs, personal_ghs, rides_ghs, total_ghs")
      .eq("plan_id", plan.id)
      .eq("member_id", member.id)
      .maybeSingle();
    if (own) order = { ...(own as MemberOrder), budget_ghs: budget ?? 0 };
  }

  const out: GroupMe = {
    memberId: member.id,
    isOrganiser: member.is_organiser,
    answer: member.answered_at
      ? {
          name: member.name,
          availability: member.availability,
          budget: budget ?? 0,
          vibes: member.vibes,
          hardNos: member.hard_nos,
          tags: member.hard_no_tags,
          fromAreaId: member.from_area_id,
        }
      : null,
    attending,
    order,
  };
  return json(out);
}
