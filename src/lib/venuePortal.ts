import { createClient } from "@/lib/supabase/server";
import { chosenVenue, requireVenueUser, type VenueSession } from "@/lib/venueAuth";

/**
 * What every venue page needs before it draws anything: who is signed in,
 * which of their venues is on screen, and that venue's picture for the
 * header. On the venue's own session, so RLS decides what comes back.
 */
export async function venuePortal(requested?: string): Promise<{
  session: VenueSession;
  venue: VenueSession["venues"][number];
  imageUrl: string | null;
  isActive: boolean;
  tourDone: boolean;
}> {
  const session = await requireVenueUser();
  const venue = chosenVenue(session, requested);
  const supabase = createClient();
  const [{ data }, { data: auth }] = await Promise.all([
    supabase.from("venues").select("image_url, is_active").eq("id", venue.id).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const row = (data ?? {}) as { image_url?: string | null; is_active?: boolean };
  return {
    session,
    venue,
    imageUrl: row.image_url ?? null,
    isActive: row.is_active !== false,
    tourDone: Boolean(auth.user?.user_metadata?.venue_tour_done),
  };
}
