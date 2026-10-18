import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCaller } from "./supabase/server";
import { hashToken, tokensMatch } from "./groupToken";
import { sendExpoPush, tokensForUsers } from "./pushServer";
import type { Availability, GroupOccasion, GroupPublic, GroupStatus, HardNo } from "./groups";
import type { Itinerary } from "./types";

/**
 * The server half of group outings: loading a group, knowing who is calling,
 * and saying only what that caller may hear.
 *
 * Every read lists its columns. Budgets live in group_member_secrets and are
 * read in exactly two places, the member's own /me and the planner, so a new
 * route that forgets this file exists still cannot return one by accident.
 */

export const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export interface GroupRow {
  id: string;
  code: string;
  owner_id: string;
  occasion: GroupOccasion;
  title: string | null;
  date_from: string;
  date_to: string;
  area_hint_id: string | null;
  answer_deadline: string;
  expected_count: number | null;
  max_members: number;
  status: GroupStatus;
  answers_version: number;
  locked_plan_id: string | null;
  plan_date: string | null;
}

export const GROUP_COLUMNS =
  "id, code, owner_id, occasion, title, date_from, date_to, area_hint_id, answer_deadline, expected_count, max_members, status, answers_version, locked_plan_id, plan_date";

export interface MemberRow {
  id: string;
  group_id: string;
  user_id: string | null;
  is_organiser: boolean;
  name: string;
  availability: Availability;
  vibes: string[];
  hard_nos: HardNo[];
  hard_no_tags: string[];
  from_area_id: string | null;
  answered_at: string | null;
}

export const MEMBER_COLUMNS =
  "id, group_id, user_id, is_organiser, name, availability, vibes, hard_nos, hard_no_tags, from_area_id, answered_at";

const CODE = /^[A-Za-z0-9_-]{16}$/;

export async function loadGroup(db: SupabaseClient, code: string): Promise<GroupRow | null> {
  if (!CODE.test(code)) return null;
  const { data } = await db.from("groups").select(GROUP_COLUMNS).eq("code", code).maybeSingle();
  return (data as GroupRow | null) ?? null;
}

export async function loadMembers(db: SupabaseClient, groupId: string): Promise<MemberRow[]> {
  const { data } = await db
    .from("group_members")
    .select(MEMBER_COLUMNS)
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  return (data ?? []) as MemberRow[];
}

/**
 * Which member is calling: the signed-in account first, then the web edit
 * token in the X-Group-Token header (never a query string, so it stays out of
 * logs). A web answerer who later signs in to the app has their answer joined
 * to their account the first time both arrive together.
 */
export async function resolveMember(
  db: SupabaseClient,
  group: GroupRow,
  req: Request
): Promise<{ member: MemberRow | null; callerId: string | null; anonymous: boolean }> {
  const caller = await getCaller(req);
  const token = req.headers.get("x-group-token")?.trim() || null;

  if (caller) {
    const { data } = await db
      .from("group_members")
      .select(MEMBER_COLUMNS)
      .eq("group_id", group.id)
      .eq("user_id", caller.id)
      .maybeSingle();
    if (data) return { member: data as MemberRow, callerId: caller.id, anonymous: caller.anonymous };
  }

  if (token) {
    const hash = hashToken(token);
    const { data: secret } = await db
      .from("group_member_secrets")
      .select("member_id, edit_token_hash")
      .eq("edit_token_hash", hash)
      .maybeSingle();
    if (secret?.edit_token_hash && tokensMatch(secret.edit_token_hash, hash)) {
      const { data } = await db
        .from("group_members")
        .select(MEMBER_COLUMNS)
        .eq("id", secret.member_id)
        .eq("group_id", group.id)
        .maybeSingle();
      let member = (data as MemberRow | null) ?? null;
      if (member && caller && !member.user_id) {
        const { error } = await db.from("group_members").update({ user_id: caller.id }).eq("id", member.id);
        if (!error) member = { ...member, user_id: caller.id };
      }
      if (member) return { member, callerId: caller?.id ?? null, anonymous: caller?.anonymous ?? true };
    }
  }

  return { member: null, callerId: caller?.id ?? null, anonymous: caller?.anonymous ?? true };
}

/** The organiser's first name, for "Ama invited you". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** What anyone holding the link may see. */
export async function publicView(db: SupabaseClient, group: GroupRow, members?: MemberRow[]): Promise<GroupPublic> {
  const list = members ?? (await loadMembers(db, group.id));
  const organiser = list.find((m) => m.is_organiser);
  let area: string | null = null;
  if (group.area_hint_id) {
    const { data } = await db.from("areas").select("name").eq("id", group.area_hint_id).maybeSingle();
    area = (data?.name as string | undefined) ?? null;
  }
  let locked: GroupPublic["locked"] = null;
  if (group.status === "locked" && group.locked_plan_id) {
    const { data } = await db
      .from("plans")
      .select("share_slug, inputs, itinerary")
      .eq("id", group.locked_plan_id)
      .maybeSingle();
    if (data) {
      const it = data.itinerary as Itinerary;
      const inputs = data.inputs as { date?: string; startTime?: string };
      locked = {
        slug: data.share_slug as string,
        date: inputs.date ?? group.plan_date ?? "",
        startTime: inputs.startTime ?? "",
        title: it.title,
        stops: it.stops.map((s) => ({ name: s.name, area: s.area, arrival_time: s.arrival_time, label: s.label })),
      };
    }
  }
  const answered = list.filter((m) => m.answered_at).map((m) => m.name);
  return {
    code: group.code,
    occasion: group.occasion,
    title: group.title,
    organiser: firstName(organiser?.name ?? "Your friend"),
    dateFrom: group.date_from,
    dateTo: group.date_to,
    deadline: group.answer_deadline,
    area,
    status: group.status,
    answered,
    count: answered.length,
    max: group.max_members,
    locked,
  };
}

/**
 * Push once per (group, kind, key): the claim row is inserted first, and a
 * failure to insert means it already went. Never throws.
 */
export async function pushOnce(
  db: SupabaseClient,
  groupId: string,
  kind: string,
  key: string,
  userIds: string[],
  message: { title: string; body: string; url: string }
): Promise<void> {
  try {
    const tokens = await tokensForUsers(db, userIds);
    const all = [...tokens.values()].flat();
    if (!all.length) return;
    const { error } = await db.from("group_notifications").insert({ group_id: groupId, kind, key });
    if (error) return;
    await sendExpoPush(all.map((to) => ({ to, title: message.title, body: message.body, data: { url: message.url } })));
  } catch (e) {
    console.error("group push failed", kind, e);
  }
}
