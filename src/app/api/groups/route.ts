import { z } from "zod";
import { createServiceClient, getCaller } from "@/lib/supabase/server";
import { isProUser } from "@/lib/entitlements";
import { newGroupCode } from "@/lib/groupToken";
import { cleanName, isAllowedName } from "@/lib/namePoll";
import { FREE_ACTIVE_GROUPS, GROUP_MAX, GROUP_MAX_DAYS, GROUP_MAX_PICKED, GROUP_OCCASIONS, GROUP_PICK_WINDOW_DAYS, type GroupSummary } from "@/lib/groups";
import { json } from "@/lib/groupServer";

/**
 * Start a group outing, or list mine.
 *
 * Starting one needs a real account: a group has to outlive a reinstall and
 * reach its organiser by push, and an anonymous session can be minted at will,
 * which would make the free limit meaningless. Answering never needs one.
 */
export const maxDuration = 15;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  occasion: z.enum(GROUP_OCCASIONS),
  title: z.string().trim().max(80).optional(),
  // Either a range (dateFrom to dateTo) or chosen days (days), not both.
  dateFrom: z.string().regex(DAY).optional(),
  dateTo: z.string().regex(DAY).optional(),
  days: z.array(z.string().regex(DAY)).min(1).max(GROUP_MAX_PICKED).optional(),
  areaHintId: z.string().uuid().nullable().optional(),
  deadline: z.string().datetime({ offset: true }),
  expected: z.number().int().min(2).max(GROUP_MAX).optional(),
  organiserName: z.string().trim().min(1).max(24),
});

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return json({ error: "sign_in" }, 401);
  if (caller.anonymous) return json({ error: "account_needed" }, 403);

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return json({ error: "invalid" }, 400);
  }

  const today = new Date().toISOString().slice(0, 10);
  const days = body.days ? [...new Set(body.days)].sort() : null;
  const dateFrom = days ? days[0] : body.dateFrom;
  const dateTo = days ? days[days.length - 1] : body.dateTo;
  if (!dateFrom || !dateTo) return json({ error: "dates" }, 400);
  const from = new Date(`${dateFrom}T12:00:00Z`).getTime();
  const to = new Date(`${dateTo}T12:00:00Z`).getTime();
  const deadline = new Date(body.deadline).getTime();
  const span = (to - from) / 86_400_000;
  const tooLong = days ? (to - Date.now()) / 86_400_000 > GROUP_PICK_WINDOW_DAYS : span > GROUP_MAX_DAYS - 1;
  if (dateFrom < today || to < from || tooLong) return json({ error: "dates" }, 400);
  // Answers close before the last day of the range ends, and after now.
  if (deadline <= Date.now() || deadline > to + 12 * 3_600_000) return json({ error: "deadline" }, 400);

  const name = cleanName(body.organiserName);
  if (!isAllowedName(name)) return json({ error: "name" }, 400);

  const db = createServiceClient();
  if (body.areaHintId) {
    const { data } = await db.from("areas").select("id").eq("id", body.areaHintId).maybeSingle();
    if (!data) return json({ error: "area" }, 400);
  }

  // Ten a day at most, whatever the plan: a ceiling against scripts, not a product limit.
  const { count } = await db
    .from("groups")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", caller.id)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= 10) return json({ error: "slow_down" }, 429);

  const limit = (await isProUser(caller.id)) ? null : FREE_ACTIVE_GROUPS;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newGroupCode();
    const { data, error } = await db.rpc("group_create", {
      p_owner: caller.id,
      p_code: code,
      p_occasion: body.occasion,
      p_title: body.title || null,
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_area_hint: body.areaHintId ?? null,
      p_deadline: new Date(deadline).toISOString(),
      p_expected: body.expected ?? null,
      p_name: name,
      p_limit: limit,
    });
    if (error) {
      // A code collision is one in 2^96; try a fresh code rather than fail.
      if (error.code === "23505") continue;
      console.error("group create failed", error);
      return json({ error: "unavailable" }, 500);
    }
    const row = (Array.isArray(data) ? data[0] : data) as { group_id: string | null; active: number } | null;
    if (!row?.group_id) return json({ error: "groups_limit", active: row?.active ?? FREE_ACTIVE_GROUPS, limit }, 402);
    if (days) await db.from("groups").update({ day_options: days }).eq("id", row.group_id);
    return json({ code }, 201);
  }
  return json({ error: "unavailable" }, 500);
}

export async function GET(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return json({ error: "sign_in" }, 401);
  const db = createServiceClient();
  const { data: mine } = await db.from("group_members").select("group_id, is_organiser").eq("user_id", caller.id);
  const rows = (mine ?? []) as { group_id: string; is_organiser: boolean }[];
  if (!rows.length) return json({ groups: [] });
  const { data: groups } = await db
    .from("groups")
    .select("id, code, title, occasion, status, date_from, date_to, plan_date, owner_id, created_at")
    .in("id", rows.map((r) => r.group_id))
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(30);
  const out: GroupSummary[] = (groups ?? []).map((g) => ({
    code: g.code,
    title: g.title,
    occasion: g.occasion,
    status: g.status,
    role: g.owner_id === caller.id ? "organiser" : "member",
    dateFrom: g.date_from,
    dateTo: g.date_to,
    planDate: g.plan_date,
  }));
  return json({ groups: out });
}
