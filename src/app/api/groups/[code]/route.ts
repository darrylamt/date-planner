import { createServiceClient, getCaller } from "@/lib/supabase/server";
import { json, loadGroup, publicView } from "@/lib/groupServer";

/**
 * A group as anyone holding its link may see it: who started it, the dates,
 * the deadline, who has answered, and once locked, the plan's outline.
 * Never a budget, never an order.
 */
export const maxDuration = 15;

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const db = createServiceClient();
  const group = await loadGroup(db, params.code);
  if (!group || group.status === "cancelled") return json({ error: "not_found" }, 404);
  return json(await publicView(db, group));
}

/** The organiser calls it off. Frees its place under the free limit. */
export async function DELETE(req: Request, { params }: { params: { code: string } }) {
  const caller = await getCaller(req);
  if (!caller) return json({ error: "sign_in" }, 401);
  const db = createServiceClient();
  const group = await loadGroup(db, params.code);
  if (!group || group.owner_id !== caller.id) return json({ error: "not_found" }, 404);
  if (group.status === "locked") return json({ error: "locked" }, 409);
  await db.from("groups").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", group.id);
  return json({ ok: true });
}
