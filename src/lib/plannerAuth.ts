import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logPlannerVisit } from "@/lib/plannerActivity";

/**
 * The gate for /planner, the event planner's own space.
 *
 * Built like the venue gate and for the same reason: everything runs on the
 * planner's own session, so the policies from 0046 and 0072 decide what they
 * can reach, and a bug in this file cannot widen it.
 *
 * Planners used to share /venue with restaurants, on screens designed for a
 * restaurant's week. A planner's work is a night at a time, mostly from a
 * phone, so they have their own space now and the venue pages send them here.
 */

export interface PlannerPlace {
  id: string;
  name: string;
  area_id: string;
  area: string;
}

export interface PlannerSession {
  userId: string;
  planner: {
    username: string;
    displayName: string;
    logoUrl: string | null;
    contactPhone: string | null;
    /** Switched off by an admin: they can look but not publish. */
    isActive: boolean;
  };
  /** Places they added themselves (venue_users rows from 0046). */
  ownPlaces: PlannerPlace[];
  /** Whether they have been through the welcome tour, on this account. */
  tourDone: boolean;
}

export async function requirePlanner(): Promise<PlannerSession> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/planner/login");

  const [{ data: row }, { data: grants }] = await Promise.all([
    supabase.from("event_planners").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("venue_users").select("venue_id, venues(id, name, area_id, areas(name))").eq("user_id", user.id),
  ]);

  if (!row) {
    // A restaurant's login belongs in the venue portal; anybody else is told plainly.
    redirect(grants?.length ? "/venue" : "/planner/login?as=not-a-planner");
  }

  const r = row as {
    username: string;
    display_name: string;
    logo_url?: string | null;
    contact_phone?: string | null;
    is_active?: boolean | null;
  };

  // When they were working, for the admin's activity log (0076).
  await logPlannerVisit(user.id);

  const ownPlaces = (grants ?? [])
    .map((g: { venues: unknown }) => g.venues as { id: string; name: string; area_id: string; areas: { name: string } | null } | null)
    .filter((v): v is { id: string; name: string; area_id: string; areas: { name: string } | null } => Boolean(v))
    .map((v) => ({ id: v.id, name: v.name, area_id: v.area_id, area: v.areas?.name ?? "" }));

  return {
    userId: user.id,
    planner: {
      username: r.username,
      displayName: r.display_name,
      logoUrl: r.logo_url ?? null,
      contactPhone: r.contact_phone ?? null,
      isActive: r.is_active !== false,
    },
    ownPlaces,
    tourDone: Boolean(user.user_metadata?.planner_tour_done),
  };
}
