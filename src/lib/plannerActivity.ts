import { createServiceClient } from "@/lib/supabase/server";

/**
 * Writing to the planner activity log (0076) from the server.
 *
 * Changes a planner makes on their own session are logged by a trigger.
 * These are the ones that go through the service role, where the database
 * cannot tell who asked: a place added on Google, a new part of town, a logo,
 * and a visit to the portal.
 *
 * Best effort, always: a log that cannot be written must never stop the
 * thing it was recording. Before 0076 has run every call simply fails quietly.
 */

export type PlannerAction =
  | "visit"
  | "place.create"
  | "area.create"
  | "logo.update"
  | "logo.remove";

export async function logPlannerActivity(entry: {
  userId: string;
  action: PlannerAction;
  summary: string;
  entityId?: string | null;
  changes?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await createServiceClient()
      .from("planner_activity")
      .insert({
        user_id: entry.userId,
        action: entry.action,
        summary: entry.summary.slice(0, 300),
        entity_id: entry.entityId ?? null,
        changes: entry.changes ?? null,
      });
  } catch {
    /* Never in the way. */
  }
}

/** How long one visit lasts before another is written down. */
const VISIT_GAP_MINUTES = 30;

/**
 * A visit to the portal, at most once every half hour per planner, so the
 * log says when somebody was working without a row for every page they opened.
 */
export async function logPlannerVisit(userId: string): Promise<void> {
  try {
    const db = createServiceClient();
    const since = new Date(Date.now() - VISIT_GAP_MINUTES * 60_000).toISOString();
    const { data, error } = await db
      .from("planner_activity")
      .select("id")
      .eq("user_id", userId)
      .eq("action", "visit")
      .gte("at", since)
      .limit(1);
    if (error || data?.length) return;
    await db.from("planner_activity").insert({ user_id: userId, action: "visit", summary: "Opened the portal" });
  } catch {
    /* Never in the way. */
  }
}
