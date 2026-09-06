import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for emailed links — signup confirmation and password
 * recovery. Exchanges the code for a session, then continues to `next`
 * (/auth/reset for recovery, so the visitor can choose a password).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // `next` comes from the URL, so only ever treat it as a path on this origin.
  const requested = searchParams.get("next") ?? "/plans";
  const next = /^\/(?!\/)/.test(requested) ? requested : "/plans";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
