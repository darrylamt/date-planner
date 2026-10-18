import { z } from "zod";
import { createServiceClient, getCaller } from "@/lib/supabase/server";
import { serverSlug } from "@/lib/groupToken";
import { json, loadGroup, loadMembers, pushOnce } from "@/lib/groupServer";
import type { Itinerary, PlanInputs } from "@/lib/types";

/**
 * Lock the group's plan in.
 *
 * It becomes an ordinary saved plan owned by the organiser, so the share
 * page, reservations, Who pays, Split the bill and the evening-before reminder
 * all work as they do for any plan. Its budget is what everyone pays, never
 * anybody's own, and its orders are the shared lines only.
 *
 * Any proposed plan may be locked: the organiser's override when voting
 * arrives needs nothing new here.
 */
export const maxDuration = 15;

const bodySchema = z.object({ planId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const caller = await getCaller(req);
  if (!caller) return json({ error: "sign_in" }, 401);
  const db = createServiceClient();
  const group = await loadGroup(db, params.code);
  if (!group || group.status === "cancelled") return json({ error: "not_found" }, 404);
  if (group.owner_id !== caller.id) return json({ error: "not_organiser" }, 403);

  // Locking twice returns the plan already made.
  if (group.status === "locked" && group.locked_plan_id) {
    const { data } = await db.from("plans").select("share_slug").eq("id", group.locked_plan_id).maybeSingle();
    if (data) return json({ slug: data.share_slug });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return json({ error: "invalid" }, 400);
  }

  const { data: plan } = await db
    .from("group_plans")
    .select("id, status, answers_version, inputs, shared_itinerary, attending_member_ids")
    .eq("id", body.planId)
    .eq("group_id", group.id)
    .maybeSingle();
  if (!plan || (plan.status !== "proposed" && plan.status !== "option")) return json({ error: "not_found" }, 404);
  if (plan.answers_version !== group.answers_version) return json({ error: "stale" }, 409);

  const members = await loadMembers(db, group.id);
  const attending = members.filter((m) => (plan.attending_member_ids as string[]).includes(m.id));
  const itinerary = plan.shared_itinerary as Itinerary;
  const inputs = plan.inputs as PlanInputs;
  // On the organiser's own phone they are "Me", as everywhere else in the bill screens.
  const companions = attending.map((m) => (m.is_organiser ? "Me" : m.name));

  let slug = "";
  let planRowId: string | null = null;
  for (let attempt = 0; attempt < 3 && !planRowId; attempt++) {
    slug = serverSlug();
    const { data, error } = await db
      .from("plans")
      .insert({
        user_id: group.owner_id,
        share_slug: slug,
        inputs: { ...inputs, partySize: attending.length, companions },
        itinerary,
        total_budget_ghs: itinerary.est_total_ghs,
        estimated_total_ghs: itinerary.est_total_ghs,
        group_id: group.id,
      })
      .select("id")
      .single();
    if (data) planRowId = data.id;
    else if (error?.code !== "23505") {
      console.error("group lock insert failed", error);
      return json({ error: "unavailable" }, 500);
    }
  }
  if (!planRowId) return json({ error: "unavailable" }, 500);

  const now = new Date().toISOString();
  await db.from("group_plans").update({ status: "superseded" }).eq("group_id", group.id).neq("id", plan.id).in("status", ["proposed", "option"]);
  await db.from("group_plans").update({ status: "locked", locked_at: now }).eq("id", plan.id);
  await db
    .from("groups")
    .update({ status: "locked", locked_plan_id: planRowId, plan_date: inputs.date, updated_at: now })
    .eq("id", group.id);

  const others = attending.filter((m) => !m.is_organiser && m.user_id).map((m) => m.user_id as string);
  await pushOnce(db, group.id, "locked", "", others, {
    title: "The plan is set",
    body: `${itinerary.title}. Open it to see your own order.`,
    url: `/group/${group.code}`,
  });

  return json({ slug });
}
