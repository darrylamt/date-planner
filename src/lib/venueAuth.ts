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

  const { data } = await supabase
    .from("venue_users")
    .select("venue_id, venues(id, name, areas(name))")
    .eq("user_id", user.id);

  const venues = (data ?? [])
    .map((row: { venues: unknown }) => row.venues as { id: string; name: string; areas: { name: string } | null } | null)
    .filter((v): v is { id: string; name: string; areas: { name: string } | null } => Boolean(v))
    .map((v) => ({ id: v.id, name: v.name, area: v.areas?.name ?? null }));

  /*
   * Signed in, but running nothing. That is an app user who reached the portal
   * rather than an error, so it says so plainly instead of offering a login
   * form they would fill in with the same account.
   */
  if (!venues.length) redirect("/venue/login?as=not-a-venue");

  return { userId: user.id, venues };
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
