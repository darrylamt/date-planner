import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { cleanName, isAllowedName } from "@/lib/namePoll";
import { VIBES } from "@/lib/planConstants";
import { HARD_NO_IDS, SLOTS, datesInRange } from "@/lib/groups";
import { fingerprint, recentCount } from "@/lib/rateLimit";
import { hashToken, newEditToken } from "@/lib/groupToken";
import { json, loadGroup, loadMembers, pushOnce, resolveMember, type GroupRow } from "@/lib/groupServer";

/**
 * Answer a group, or change an answer.
 *
 * Open to anyone with the link: a friend with no account answers on the web
 * and gets an edit token back, once, to keep in their browser. Someone in the
 * app is known by their session. Either way the budget goes into its own table
 * and never comes back out to anybody else.
 */
export const maxDuration = 15;

const answerSchema = z.object({
  name: z.string().trim().min(1).max(24),
  availability: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.array(z.enum(SLOTS)).max(2)),
  budget: z.number().int().min(0).max(10000).refine((n) => n % 50 === 0, "steps of 50"),
  vibes: z.array(z.enum(VIBES)).max(3).default([]),
  hardNos: z.array(z.enum(HARD_NO_IDS as [string, ...string[]])).max(HARD_NO_IDS.length).default([]),
  tags: z.array(z.string().trim().min(1).max(24)).max(5).default([]),
  fromAreaId: z.string().uuid().nullable().default(null),
  // A field people never see. Filled in, it was a script.
  website: z.string().optional(),
});

function cleanAvailability(group: GroupRow, raw: Record<string, string[]>) {
  const allowed = new Set(datesInRange(group.date_from, group.date_to));
  const out: Record<string, string[]> = {};
  for (const [date, slots] of Object.entries(raw)) {
    if (allowed.has(date) && slots.length) out[date] = [...new Set(slots)];
  }
  return out;
}

export async function PUT(req: Request, { params }: { params: { code: string } }) {
  const db = createServiceClient();
  const group = await loadGroup(db, params.code);
  if (!group || group.status === "cancelled") return json({ error: "not_found" }, 404);
  if (group.status === "locked") return json({ error: "locked" }, 409);

  let body: z.infer<typeof answerSchema>;
  try {
    body = answerSchema.parse(await req.json());
  } catch {
    return json({ error: "invalid" }, 400);
  }
  if (body.website) return json({ ok: true });

  const name = cleanName(body.name);
  if (!isAllowedName(name)) return json({ error: "name" }, 400);
  const availability = cleanAvailability(group, body.availability);
  if (body.fromAreaId) {
    const { data } = await db.from("areas").select("id").eq("id", body.fromAreaId).maybeSingle();
    if (!data) return json({ error: "area" }, 400);
  }

  const now = new Date().toISOString();
  const fields = {
    name,
    availability,
    vibes: body.vibes,
    hard_nos: body.hardNos,
    hard_no_tags: body.tags,
    from_area_id: body.fromAreaId,
    updated_at: now,
  };
  const { member, callerId } = await resolveMember(db, group, req);
  const fp = fingerprint(req);

  let memberId: string;
  let token: string | undefined;
  let firstAnswer = false;

  if (member) {
    const { data: last } = await db.from("group_members").select("updated_at").eq("id", member.id).maybeSingle();
    if (member.answered_at && last?.updated_at && Date.now() - Date.parse(last.updated_at) < 3000) {
      return json({ error: "slow_down" }, 429);
    }
    firstAnswer = !member.answered_at;
    const { error } = await db
      .from("group_members")
      .update({ ...fields, answered_at: member.answered_at ?? now })
      .eq("id", member.id);
    if (error) return json({ error: error.code === "23505" ? "name_taken" : "unavailable" }, error.code === "23505" ? 409 : 500);
    const { error: secretError } = await db
      .from("group_member_secrets")
      .upsert({ member_id: member.id, budget_ghs: body.budget }, { onConflict: "member_id" });
    if (secretError) return json({ error: "unavailable" }, 500);
    memberId = member.id;
  } else {
    // Ceilings against scripts, generous for a houseful of friends on one Wi-Fi.
    if ((await recentCount(db, "group_members", "fingerprint", fp, 3_600_000)) >= 20) return json({ error: "slow_down" }, 429);
    if ((await recentCount(db, "group_members", "fingerprint", fp, 86_400_000, { group_id: group.id })) >= 8) {
      return json({ error: "slow_down" }, 429);
    }
    const { data: created, error } = await db
      .from("group_members")
      .insert({ ...fields, group_id: group.id, user_id: callerId, answered_at: now, fingerprint: fp })
      .select("id")
      .single();
    if (error || !created) {
      if (error?.code === "23505") return json({ error: "name_taken" }, 409);
      if (error?.message?.includes("group_full")) return json({ error: "group_full" }, 409);
      console.error("group answer insert failed", error);
      return json({ error: "unavailable" }, 500);
    }
    memberId = created.id;
    // An app answerer is known by their account; only the web needs a token.
    if (!callerId) token = newEditToken();
    const { error: secretError } = await db.from("group_member_secrets").insert({
      member_id: memberId,
      budget_ghs: body.budget,
      edit_token_hash: token ? hashToken(token) : null,
    });
    if (secretError) {
      await db.from("group_members").delete().eq("id", memberId);
      return json({ error: "unavailable" }, 500);
    }
    firstAnswer = true;
  }

  if (firstAnswer && member?.is_organiser !== true) {
    const url = `/group/${group.code}`;
    await pushOnce(db, group.id, "answered", memberId, [group.owner_id], {
      title: `${name} is in`,
      body: group.title ? `Answered for ${group.title}.` : "They've answered your group outing.",
      url,
    });
    if (group.expected_count) {
      const answered = (await loadMembers(db, group.id)).filter((m) => m.answered_at).length;
      if (answered >= group.expected_count) {
        await pushOnce(db, group.id, "all_in", "", [group.owner_id], {
          title: "Everyone's answered",
          body: "Get a plan that works for the whole group.",
          url,
        });
      }
    }
  }

  return json({ memberId, ...(token ? { token } : {}) });
}

/** Leave the group before it's locked. The organiser can't: they cancel it instead. */
export async function DELETE(req: Request, { params }: { params: { code: string } }) {
  const db = createServiceClient();
  const group = await loadGroup(db, params.code);
  if (!group || group.status === "cancelled") return json({ error: "not_found" }, 404);
  if (group.status === "locked") return json({ error: "locked" }, 409);
  const { member } = await resolveMember(db, group, req);
  if (!member) return json({ error: "not_member" }, 403);
  if (member.is_organiser) return json({ error: "organiser" }, 409);
  await db.from("group_members").delete().eq("id", member.id);
  return json({ ok: true });
}
