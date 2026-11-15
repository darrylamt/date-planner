import { supabase } from "./supabase";
import { registerForPush } from "./push";

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

/*
 * Lists and alerts (0113, Pro). Lists are the account's own rows; making one
 * or adding to one is Pro, and the database says "star_lists_pro" otherwise.
 * Every read is empty before the migration, so the app can ship first.
 */

export interface StarList {
  id: string;
  name: string;
  venueIds: string[];
}

export type ListResult = "ok" | "pro" | "failed";

const listError = (message?: string): ListResult => (message && /star_lists_pro/.test(message) ? "pro" : "failed");

export async function myLists(): Promise<StarList[]> {
  const uid = await me();
  if (!uid) return [];
  const [{ data: lists, error }, { data: items }] = await Promise.all([
    supabase.from("star_lists").select("id, name").eq("user_id", uid).order("created_at").limit(50),
    supabase.from("star_list_venues").select("list_id, venue_id").eq("user_id", uid).limit(5000),
  ]);
  if (error) return [];
  const rows = (items ?? []) as { list_id: string; venue_id: string }[];
  return ((lists ?? []) as { id: string; name: string }[]).map((l) => ({
    id: l.id,
    name: l.name,
    venueIds: rows.filter((r) => r.list_id === l.id).map((r) => r.venue_id),
  }));
}

export async function createList(name: string): Promise<{ result: ListResult; list?: StarList }> {
  const uid = await me();
  if (!uid) return { result: "failed" };
  const { data, error } = await supabase.from("star_lists").insert({ user_id: uid, name: name.trim().slice(0, 40) }).select("id, name").single();
  if (error) return { result: listError(error.message) };
  return { result: "ok", list: { ...(data as { id: string; name: string }), venueIds: [] } };
}

export async function renameList(id: string, name: string): Promise<boolean> {
  const { error } = await supabase.from("star_lists").update({ name: name.trim().slice(0, 40) }).eq("id", id);
  return !error;
}

export async function deleteList(id: string): Promise<boolean> {
  const { error } = await supabase.from("star_lists").delete().eq("id", id);
  return !error;
}

export async function setInList(listId: string, venueId: string, on: boolean): Promise<ListResult> {
  const uid = await me();
  if (!uid) return "failed";
  const { error } = on
    ? await supabase.from("star_list_venues").insert({ list_id: listId, venue_id: venueId, user_id: uid })
    : await supabase.from("star_list_venues").delete().eq("list_id", listId).eq("venue_id", venueId);
  if (!error || error.code === "23505") return "ok";
  return listError(error.message);
}

/** Star alerts on for this account; null when signed out or before 0113. */
export async function starAlertsOn(): Promise<boolean | null> {
  const uid = await me();
  if (!uid) return null;
  const { data, error } = await supabase.from("notification_prefs").select("star_alerts").eq("user_id", uid).maybeSingle();
  if (error) return null;
  return Boolean((data as { star_alerts?: boolean } | null)?.star_alerts);
}

/** On asks the phone for notifications first, as nudges do. */
export async function setStarAlerts(on: boolean): Promise<{ ok: boolean; message?: string }> {
  const uid = await me();
  if (!uid) return { ok: false, message: "Sign in to get these." };
  if (on) {
    const push = await registerForPush();
    if (push === "denied") return { ok: false, message: "Notifications are off for Duro. Turn them on in Settings, then try again." };
    if (push !== "granted") return { ok: false, message: "That did not work on this phone. Try again later." };
  }
  const { error } = await supabase
    .from("notification_prefs")
    .upsert({ user_id: uid, star_alerts: on, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return error ? { ok: false, message: "That did not save. Try again when you have signal." } : { ok: true };
}
