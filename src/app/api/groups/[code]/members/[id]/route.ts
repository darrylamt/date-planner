import { createServiceClient, getCaller } from "@/lib/supabase/server";
import { json, loadGroup } from "@/lib/groupServer";

/**
 * The organiser removes an answer: a duplicate, a joke, or a friend who lost
 * their browser and needs to answer again. Never the organiser, never after
 * the plan is locked.
 */
export const maxDuration = 15;

export async function DELETE(req: Request, { params }: { params: { code: string; id: string } }) {
  const caller = await getCaller(req);
  if (!caller) return json({ error: "sign_in" }, 401);
  const db = createServiceClient();
  const group = await loadGroup(db, params.code);
  if (!group || group.status === "cancelled") return json({ error: "not_found" }, 404);
  if (group.owner_id !== caller.id) return json({ error: "not_organiser" }, 403);
  if (group.status === "locked") return json({ error: "locked" }, 409);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return json({ error: "not_found" }, 404);
  const { data: member } = await db
    .from("group_members")
    .select("id, is_organiser")
    .eq("id", params.id)
    .eq("group_id", group.id)
    .maybeSingle();
  if (!member) return json({ error: "not_found" }, 404);
  if (member.is_organiser) return json({ error: "organiser" }, 409);
  await db.from("group_members").delete().eq("id", member.id);
  return json({ ok: true });
}
