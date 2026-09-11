import { supabase } from "./supabase";

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/** How many plans this account has saved. Null-safe: 0 on any failure. */
export async function countSavedPlans(): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("plans")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return error ? 0 : (count ?? 0);
}

/**
 * Delete this account for good.
 *
 * Goes through the web API rather than Supabase directly: removing an auth
 * user is an admin operation, and the key that can do it must never be in a
 * shipped app. The session cookie decides whose account is deleted, so there
 * is no id here to get wrong.
 */
export async function deleteAccount(): Promise<boolean> {
  if (!BASE) return false;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false;

  try {
    const res = await fetch(`${BASE}/api/account/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── profile ─────────────────────────────────────────────────────────── */

export interface Profile {
  displayName: string;
  avatarUrl: string | null;
  email: string;
}

/** A name to show when none has been set. Never the whole email address. */
export function nameFromEmail(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  if (!local) return "You";
  // "darryl.amt" and "darryl_amt" are both a first name with noise after it.
  const first = local.split(/[._-]/)[0] ?? local;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export async function fetchProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, email")
    .eq("id", user.id)
    .maybeSingle();

  const email = data?.email ?? user.email ?? "";
  return {
    displayName: data?.display_name?.trim() || nameFromEmail(email),
    avatarUrl: data?.avatar_url ?? null,
    email,
  };
}

export async function updateDisplayName(name: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const trimmed = name.trim().slice(0, 60);
  const { error } = await supabase
    .from("profiles")
    // Blank clears it rather than storing an empty string, so the fallback
    // to a name from the email takes over again.
    .update({ display_name: trimmed || null })
    .eq("id", user.id);

  return !error;
}

/**
 * Upload a new avatar and point the profile at it.
 *
 * Stored under a folder named for the user, which is what the storage policy
 * checks, so nobody can overwrite anyone else's face. The filename carries a
 * timestamp because the URL is public and cached: reusing one would leave the
 * old picture on screen until the cache expired.
 */
/**
 * Avatars can be a mascot instead of a photograph.
 *
 * Stored in the same column with a prefix rather than a second field: an
 * avatar is one choice, and two columns would let a picture and a mascot both
 * be set with nothing to say which wins.
 */
export const MASCOT_PREFIX = "mascot:";

export function isMascotAvatar(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith(MASCOT_PREFIX));
}

export function mascotFromAvatar(url: string | null | undefined): string | null {
  return isMascotAvatar(url) ? url!.slice(MASCOT_PREFIX.length) : null;
}

export async function setMascotAvatar(occasion: string): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const value = `${MASCOT_PREFIX}${occasion}`;
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: value })
    .eq("id", user.id);

  return error ? null : value;
}

export async function uploadAvatar(uri: string): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    const response = await fetch(uri);
    const bytes = await response.arrayBuffer();

    const ext = (uri.split(".").pop() ?? "jpg").split("?")[0].toLowerCase();
    const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
    const path = `${user.id}/${Date.now()}.${safeExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, bytes, {
        contentType: safeExt === "png" ? "image/png" : "image/jpeg",
        upsert: true,
      });
    if (uploadError) return null;

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", user.id);

    return error ? null : publicUrl;
  } catch {
    return null;
  }
}
