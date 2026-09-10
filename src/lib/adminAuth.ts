import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * The admin gate, in one place.
 *
 * Every admin route repeated the same three steps — fetch the user, read
 * profiles.is_admin, return 401 or 403 — and a route that forgets one of them
 * is an endpoint that spends money for anyone who can guess its path. Having
 * one implementation means a new admin route cannot be quietly less protected
 * than the others.
 *
 * Returns the Supabase client on success, or the response to send back.
 */
export async function requireAdmin(): Promise<
  | { ok: true; supabase: ReturnType<typeof createClient>; userId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sign in required." }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
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

  return { ok: true, supabase, userId: user.id };
}
