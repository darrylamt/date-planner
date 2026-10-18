import { createServiceClient, getCaller } from "@/lib/supabase/server";
import { json, loadGroup, loadMembers, publicView } from "@/lib/groupServer";
import { hardNosOf } from "@/lib/groupMerge";
import { HARD_NO_IDS, SLOTS, datesInRange, hardNoFromTag, type GroupOrganiserView, type Slot } from "@/lib/groups";
import type { Itinerary } from "@/lib/types";

/**
 * What the organiser sees: who has answered, when people can make it, what
 * they're into, what they refuse, and the current proposal.
 *
 * Counts and names only. No budget, no lowest budget, no order: the organiser
 * is in the group too, and the point is that nobody knows what anybody else
 * can spend.
 */
export const maxDuration = 15;

export async function GET(req: Request, { params }: { params: { code: string } }) {
  const caller = await getCaller(req);
  if (!caller) return json({ error: "sign_in" }, 401);
  const db = createServiceClient();
  const group = await loadGroup(db, params.code);
  if (!group || group.status === "cancelled") return json({ error: "not_found" }, 404);
  if (group.owner_id !== caller.id) return json({ error: "not_organiser" }, 403);

  // Past the deadline the group is ready to plan, whoever is still to answer.
  if (group.status === "collecting" && Date.parse(group.answer_deadline) <= Date.now()) {
    await db.from("groups").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", group.id);
    group.status = "ready";
  }

  const members = await loadMembers(db, group.id);
  const answered = members.filter((m) => m.answered_at);

  const tally: GroupOrganiserView["tally"] = [];
  for (const date of datesInRange(group.date_from, group.date_to)) {
    for (const slot of SLOTS) {
      const names = answered.filter((m) => (m.availability[date] ?? []).includes(slot)).map((m) => m.name);
      tally.push({ date, slot, count: names.length, names });
    }
  }

  const vibeCount = new Map<string, number>();
  const noCount = new Map<string, number>();
  const tags = new Set<string>();
  const areaCount = new Map<string, number>();
  for (const m of answered) {
    for (const v of m.vibes) vibeCount.set(v, (vibeCount.get(v) ?? 0) + 1);
    for (const id of hardNosOf({ hardNos: m.hard_nos, tags: m.hard_no_tags })) noCount.set(id, (noCount.get(id) ?? 0) + 1);
    for (const t of m.hard_no_tags) if (!hardNoFromTag(t)) tags.add(t.toLowerCase());
    if (m.from_area_id) areaCount.set(m.from_area_id, (areaCount.get(m.from_area_id) ?? 0) + 1);
  }
  const areaIds = [...areaCount.keys()];
  const { data: areaRows } = areaIds.length
    ? await db.from("areas").select("id, name").in("id", areaIds)
    : { data: [] as { id: string; name: string }[] };
  const areaName = new Map((areaRows ?? []).map((a) => [a.id as string, a.name as string]));

  const { data: plan } = await db
    .from("group_plans")
    .select("id, inputs, shared_itinerary, attending_member_ids, answers_version")
    .eq("group_id", group.id)
    .in("status", ["proposed", "locked"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let proposal: GroupOrganiserView["proposal"] = null;
  if (plan) {
    const inputs = plan.inputs as { date: string; startTime: string };
    const attendingIds = new Set(plan.attending_member_ids as string[]);
    proposal = {
      planId: plan.id,
      date: inputs.date,
      slot: (inputs.startTime >= "17:00" ? "evening" : "day") as Slot,
      itinerary: plan.shared_itinerary as Itinerary,
      attending: members.filter((m) => attendingIds.has(m.id)).map((m) => m.name),
      away: answered.filter((m) => !attendingIds.has(m.id)).map((m) => m.name),
      stale: plan.answers_version !== group.answers_version,
    };
  }

  const view: GroupOrganiserView = {
    ...(await publicView(db, group, members)),
    members: members.map((m) => ({ id: m.id, name: m.name, answered: Boolean(m.answered_at), isOrganiser: m.is_organiser })),
    tally,
    vibes: [...vibeCount.entries()].map(([vibe, count]) => ({ vibe, count })).sort((a, b) => b.count - a.count),
    hardNos: HARD_NO_IDS.filter((id) => noCount.has(id)).map((id) => ({ id, count: noCount.get(id)! })),
    tags: [...tags].slice(0, 20),
    areas: [...areaCount.entries()]
      .map(([id, count]) => ({ name: areaName.get(id) ?? "Somewhere", count }))
      .sort((a, b) => b.count - a.count),
    proposal,
  };
  return json(view);
}
