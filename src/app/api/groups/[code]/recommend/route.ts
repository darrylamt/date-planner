import { z } from "zod";
import { createClient, createServiceClient, getCaller } from "@/lib/supabase/server";
import { fetchCandidates } from "@/lib/matching";
import { assembleItinerary } from "@/lib/itinerary";
import { fallbackCopy, writePlanCopy } from "@/lib/copy";
import { REACH_FALLBACK_KM } from "@/lib/planConstants";
import { hardNosOf, mergeInputs, type MergeMember } from "@/lib/groupMerge";
import { planForCopy, planGroup, sharedItinerary, type GroupPerson } from "@/lib/groupPlan";
import { SLOTS, groupDays } from "@/lib/groups";
import { areaCentroids } from "@/lib/areaCentroids";
import { liveAreas } from "@/lib/coverage";
import { json, loadGroup, loadMembers } from "@/lib/groupServer";
import type { PlanInputs } from "@/lib/types";

/**
 * Plan the group's evening: the date most people can make, venues that work
 * for the lowest budget, and an order for each person sized to their own.
 *
 * Organiser only. What comes back is the shared view; each person's own order
 * is stored for them alone and read through /me.
 */
export const maxDuration = 60;

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slot: z.enum(SLOTS).optional(),
  ai: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const caller = await getCaller(req);
  if (!caller) return json({ error: "sign_in" }, 401);
  const db = createServiceClient();
  const group = await loadGroup(db, params.code);
  if (!group || group.status === "cancelled") return json({ error: "not_found" }, 404);
  if (group.owner_id !== caller.id) return json({ error: "not_organiser" }, 403);
  if (group.status === "locked") return json({ error: "locked" }, 409);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch {
    return json({ error: "invalid" }, 400);
  }

  const { count } = await db
    .from("group_plans")
    .select("id", { count: "exact", head: true })
    .eq("group_id", group.id)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= 12) return json({ error: "slow_down" }, 429);

  // Read before planning: answers that arrive meanwhile make this plan stale.
  const version = group.answers_version;
  const members = (await loadMembers(db, group.id)).filter((m) => m.answered_at);
  const { data: secrets } = members.length
    ? await db.from("group_member_secrets").select("member_id, budget_ghs").in("member_id", members.map((m) => m.id))
    : { data: [] as { member_id: string; budget_ghs: number | null }[] };
  const budgetOf = new Map((secrets ?? []).map((s) => [s.member_id as string, Number(s.budget_ghs ?? 0)]));

  const merge: MergeMember[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    isOrganiser: m.is_organiser,
    answered: true,
    availability: m.availability,
    vibes: m.vibes,
    hardNos: m.hard_nos,
    tags: m.hard_no_tags,
    fromAreaId: m.from_area_id,
  }));
  // Areas with their centres and whether a plan can be built there, for the fairest meeting point.
  const [{ data: areas }, centres, live] = await Promise.all([
    db.from("areas").select("id, name, city"),
    areaCentroids(db),
    liveAreas(db),
  ]);
  const centreOf = new Map(centres.map((a) => [a.id, a]));
  const plannable = new Set(live.map((a) => a.id));
  const areaRows = ((areas ?? []) as { id: string; name: string; city: string | null }[]).map((a) => ({
    ...a,
    lat: centreOf.get(a.id)?.lat ?? null,
    lng: centreOf.get(a.id)?.lng ?? null,
    plannable: plannable.has(a.id),
  }));
  const merged = mergeInputs(
    {
      occasion: group.occasion,
      dateFrom: group.date_from,
      dateTo: group.date_to,
      days: groupDays(group),
      areaHintId: group.area_hint_id,
    },
    merge,
    areaRows,
    { date: body.date, slot: body.slot, ai: body.ai }
  );
  if (merged.status !== "ok") return json({ status: "not_enough" });

  const people: GroupPerson[] = merged.attending.map((m) => ({
    memberId: m.id,
    name: m.name,
    budget: budgetOf.get(m.id) ?? 0,
    nos: hardNosOf(m),
  }));
  const lowest = Math.min(...people.map((p) => p.budget));
  const catalog = createClient();

  const attempt = async (inputs: PlanInputs) => {
    const skeletonInputs = { ...inputs, budget: lowest * people.length };
    const candidates = await fetchCandidates(catalog, skeletonInputs);
    return { inputs, out: planGroup(inputs, candidates, people) };
  };

  let result;
  try {
    result = await attempt(merged.inputs);
    const canReach =
      !merged.inputs.surpriseMe && merged.inputs.radiusKm !== 0 && (merged.inputs.radiusKm ?? 2) < REACH_FALLBACK_KM;
    if (result.out.status !== "ok" && canReach) result = await attempt({ ...merged.inputs, radiusKm: REACH_FALLBACK_KM });
  } catch (e) {
    console.error("group candidates failed", e);
    return json({ error: "unavailable" }, 500);
  }

  if (result.out.status !== "ok") {
    // No figures: a number here would tell the organiser something about the lowest budget.
    return json({
      status: "no_match",
      headline: "Nothing fits everyone yet",
      message:
        result.out.reason === "venues"
          ? "We couldn't find places for this group on that day. Try another date, or widen the area."
          : "We couldn't find an evening that works for every budget in the group. Try another date, or ask people to check their answers.",
    });
  }

  const out = result.out;
  const sharedTotal = out.shared.reduce((s, x) => s + x.total_ghs, 0) + out.rides_ghs;
  // Copy is written with no names and no budget: only what everyone pays.
  const copyInputs: PlanInputs = { ...result.inputs, companions: [], budget: sharedTotal };
  const forCopy = planForCopy(out);
  const written = copyInputs.ai ? await writePlanCopy(copyInputs, forCopy).catch(() => null) : null;
  const copy = written?.ok ? written.copy : fallbackCopy(copyInputs, forCopy);
  const itinerary = sharedItinerary(assembleItinerary(copyInputs, forCopy, copy), out, group.code);

  await db.from("group_plans").update({ status: "superseded" }).eq("group_id", group.id).eq("status", "proposed");
  const { data: plan, error } = await db
    .from("group_plans")
    .insert({
      group_id: group.id,
      answers_version: version,
      inputs: { ...result.inputs, budget: sharedTotal, companions: people.map((p) => p.name) },
      shared_itinerary: itinerary,
      attending_member_ids: people.map((p) => p.memberId),
    })
    .select("id")
    .single();
  if (error || !plan) {
    console.error("group plan insert failed", error);
    return json({ error: "unavailable" }, 500);
  }
  const { error: ordersError } = await db.from("group_plan_orders").insert(
    people.map((p) => {
      const o = out.members.get(p.memberId)!;
      return {
        plan_id: plan.id,
        member_id: p.memberId,
        stops: o.stops,
        shared_ghs: o.shared_ghs,
        personal_ghs: o.personal_ghs,
        rides_ghs: o.rides_ghs,
        total_ghs: o.total_ghs,
      };
    })
  );
  if (ordersError) {
    console.error("group orders insert failed", ordersError);
    await db.from("group_plans").delete().eq("id", plan.id);
    return json({ error: "unavailable" }, 500);
  }
  await db.from("groups").update({ status: "planned", updated_at: new Date().toISOString() }).eq("id", group.id);

  const attendingIds = new Set(people.map((p) => p.memberId));
  return json({
    status: "ok",
    proposal: {
      planId: plan.id,
      date: merged.date,
      slot: merged.slot,
      itinerary,
      attending: people.map((p) => p.name),
      away: members.filter((m) => !attendingIds.has(m.id)).map((m) => m.name),
      stale: false,
    },
  });
}
