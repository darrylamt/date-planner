import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The venue portal's gate.
 *
 * Deliberately not built like the admin gate. That one hands back a
 * service-role client, because admin is a flag on a profile row and migration
 * 0014 revoked the venue columns from `authenticated` outright, so an admin's
 * own client cannot read what an admin needs.
 *
 * A venue user is the opposite case: migration 0038 granted them exactly the
 * columns they may write and wrote the policies that decide which rows, so
 * Postgres already enforces the whole rule. Running the portal on the caller's
 * own session means a bug in this file cannot widen what they can reach, which
 * is not true of any design that elevates first and checks afterwards.
 */

/*
 * Re-exported so callers that already have the gate in scope do not need a
 * second import, while the definitions themselves stay in a module a client
 * component can reach.
 */
export {
  VENUE_EMAIL_DOMAIN,
  emailForUsername,
  USERNAME_PATTERN,
  normaliseUsername,
} from "./venueUsername";

export interface VenueSession {
  userId: string;
  /** Every venue this login runs. A group with branches has several. */
  venues: { id: string; name: string; area: string | null }[];
  /**
   * Set when this login belongs to an event planner rather than a venue.
   *
   * The difference the portal has to care about is not what they can edit --
   * migration 0046 routes a planner through the same venue_users rows, so
   * every policy written in 0038 applies unchanged -- but that a planner can
   * arrive owning nothing. A restaurant with no venue is a bug; a planner
   * with no location is their first day.
   */
  planner: { username: string; displayName: string } | null;
}

/**
 * Who is signed in and what they run, or a redirect to the portal's own login.
 *
 * Sent to /venue/login rather than /login: that page signs in with an email
 * and now defaults to the admin, and telling a restaurant to enter an address
 * they were never given is how a portal gets abandoned on its first visit.
 */
export async function requireVenueUser(): Promise<VenueSession> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/venue/login");

  const [{ data }, { data: plannerRow }] = await Promise.all([
    supabase
      .from("venue_users")
      .select("venue_id, venues(id, name, areas(name))")
      .eq("user_id", user.id),
    /*
     * Its own query rather than a join, because the two are unrelated: a
     * planner's row says who they are, and venue_users says what they have
     * made so far. A planner on day one has the first and none of the second.
     */
    supabase
      .from("event_planners")
      .select("username, display_name")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const planner = plannerRow
    ? {
        username: (plannerRow as { username: string }).username,
        displayName: (plannerRow as { display_name: string }).display_name,
      }
    : null;

  const venues = (data ?? [])
    .map((row: { venues: unknown }) => row.venues as { id: string; name: string; areas: { name: string } | null } | null)
    .filter((v): v is { id: string; name: string; areas: { name: string } | null } => Boolean(v))
    .map((v) => ({ id: v.id, name: v.name, area: v.areas?.name ?? null }));

  /*
   * Signed in, but running nothing.
   *
   * For a venue account that is an app user who reached the portal rather
   * than an error, so it says so plainly instead of offering a login form
   * they would fill in with the same account.
   *
   * For a planner it is the ordinary first visit, and sending them to a page
   * that says they are not a venue would be both wrong and the last thing
   * they ever read here. They go to Locations, which is the one screen that
   * works with nothing on the account yet.
   */
  if (!venues.length) {
    redirect(planner ? "/venue/locations?first=1" : "/venue/login?as=not-a-venue");
  }

  return { userId: user.id, venues, planner };
}

/**
 * The same gate, for the one page that has to survive an empty account.
 *
 * requireVenueUser redirects a planner with no locations to Locations, which
 * means Locations itself cannot use it: it would redirect to itself forever.
 */
export async function requirePortalUser(): Promise<VenueSession> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/venue/login");

  const [{ data }, { data: plannerRow }] = await Promise.all([
    supabase
      .from("venue_users")
      .select("venue_id, venues(id, name, areas(name))")
      .eq("user_id", user.id),
    supabase
      .from("event_planners")
      .select("username, display_name")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const planner = plannerRow
    ? {
        username: (plannerRow as { username: string }).username,
        displayName: (plannerRow as { display_name: string }).display_name,
      }
    : null;

  const venues = (data ?? [])
    .map((row: { venues: unknown }) => row.venues as { id: string; name: string; areas: { name: string } | null } | null)
    .filter((v): v is { id: string; name: string; areas: { name: string } | null } => Boolean(v))
    .map((v) => ({ id: v.id, name: v.name, area: v.areas?.name ?? null }));

  if (!venues.length && !planner) redirect("/venue/login?as=not-a-venue");

  return { userId: user.id, venues, planner };
}

/**
 * Which venue the portal is currently showing.
 *
 * One login can run several venues, and every page needs the same answer, so
 * the choice is a query parameter rather than a stored preference: it survives
 * a refresh, it can be linked to, and there is no state to fall out of step.
 */
export function chosenVenue(session: VenueSession, requested?: string) {
  return session.venues.find((v) => v.id === requested) ?? session.venues[0];
}
