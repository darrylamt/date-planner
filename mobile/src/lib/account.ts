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
