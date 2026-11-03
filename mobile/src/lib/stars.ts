import { supabase } from "./supabase";

/**
 * Starred venues (0103): the account's own, read and written directly. Free
 * accounts keep 10 and Pro any number; the database holds the line and
 * answers "star_limit" past it. A star also leans this person's plans
 * towards the place (the server's taste.ts).
 */

export const FREE_STARS = 10;

export type StarResult = "ok" | "limit" | "signed_out" | "failed";

export interface StarredVenue {
  id: string;
  name: string;
  image_url: string | null;
  type: string;
  area: string | null;
}

async function me(): Promise<string | null> {
  return (await supabase.auth.getSession()).data.session?.user.id ?? null;
}

/** The ids this account has starred; empty when signed out or before 0103. */
export async function myStarIds(): Promise<Set<string>> {
  const uid = await me();
  if (!uid) return new Set();
  const { data } = await supabase.from("venue_stars").select("venue_id").eq("user_id", uid).limit(1000);
  return new Set(((data ?? []) as { venue_id: string }[]).map((r) => r.venue_id));
}

export async function setStar(venueId: string, on: boolean): Promise<StarResult> {
  const uid = await me();
  if (!uid) return "signed_out";
  const { error } = on
    ? await supabase.from("venue_stars").insert({ user_id: uid, venue_id: venueId })
    : await supabase.from("venue_stars").delete().eq("user_id", uid).eq("venue_id", venueId);
  if (!error) return "ok";
  if (/star_limit/.test(error.message)) return "limit";
  // Starring twice is already starred.
  if (error.code === "23505") return "ok";
  return "failed";
}

/** The starred places, newest first, for the Starred view. */
export async function starredVenues(): Promise<StarredVenue[]> {
  const uid = await me();
  if (!uid) return [];
  const { data } = await supabase
    .from("venue_stars")
    .select("venue_id, created_at, venues(id, name, image_url, type, is_active, areas(name))")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(1000);
  type Row = { venues: { id: string; name: string; image_url: string | null; type: string; is_active: boolean; areas: { name: string } | null } | null };
  return ((data ?? []) as unknown as Row[])
    .map((r) => r.venues)
    .filter((v): v is NonNullable<Row["venues"]> => Boolean(v && v.is_active))
    .map((v) => ({ id: v.id, name: v.name, image_url: v.image_url, type: v.type, area: v.areas?.name ?? null }));
}
