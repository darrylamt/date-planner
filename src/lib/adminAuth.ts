import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * The admin gate, in one place.
 *
 * Every admin route repeated the same three steps, fetch the user, read
 * profiles.is_admin, return 401 or 403, and a route that forgets one of them
 * is an endpoint that spends money for anyone who can guess its path. Having
 * one implementation means a new admin route cannot be quietly less protected
 * than the others.
 *
 * Returns a service-role client on success, or the response to send back.
 *
 * Service role, not the caller's own client, and that is the whole point. It
 * used to hand back the cookie client, which runs as `authenticated`, and
 * migration 0014 revoked SELECT on the venue columns from that role to stop
 * every signed-in account reading unapproved phone numbers. Admin is a flag on
 * a profile row rather than a database role, so an admin is `authenticated`
 * too, and the approve endpoint's first act is to read phone_pending. It has
 * been answering "Venue not found" for every approval ever since.
 *
 * Proved rather than reasoned about: a throwaway account with is_admin = true
 * running the approve route's exact select gets 42501 permission denied, while
 * the service role gets the row.
 *
 * The identity check above still runs on the caller's own cookies. Only the
 * reading and writing is elevated, and only after the caller has been shown to
 * be an admin, which is the same trade adminDataClient already makes for the
 * admin pages. Returning the elevated client from the gate itself means a new
 * admin route cannot forget to make it.
 */
export async function requireAdmin(): Promise<
  | { ok: true; supabase: ReturnType<typeof createServiceClient>; userId: string }
  | { ok: false; response: NextResponse }
> {
  const identity = createClient();

  const {
    data: { user },
  } = await identity.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sign in required." }, { status: 401 }),
    };
  }

  const { data: profile } = await identity
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admins only." }, { status: 403 }),
    };
  }

  return { ok: true, supabase: createServiceClient(), userId: user.id };
}

/**
 * A client for admin pages to read with.
 *
 * Admin is a flag on a profile row rather than a database role, so every admin
 * is just `authenticated` as far as Postgres is concerned. That made column
 * privileges useless for protecting the phone and verification internals: any
 * grant wide enough for the admin screens was wide enough for every signed-in
 * account.
 *
 * Reading as the service role breaks that tie. Admin pages get everything,
 * `authenticated` can be narrowed to what an ordinary user needs, and the
 * check that decides which is which stays in code where it can be read.
 *
 * The identity check still runs against the caller's own cookies. Only the
 * reading is elevated, and only after the caller has been shown to be an
 * admin, so this is not a way around the gate.
 */
export async function adminDataClient() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    // Pages sit behind the admin layout, which redirects first. Reaching here
    // means that guarantee has broken, and refusing loudly beats handing back
    // a service-role client on an unverified request.
    throw new Error("adminDataClient called without an admin session");
  }
  return createServiceClient();
}
