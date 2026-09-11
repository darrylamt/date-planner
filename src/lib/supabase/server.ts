import { createClient as createBareClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Standard server client bound to the request's auth cookies. */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, middleware refreshes sessions.
          }
        },
      },
    }
  );
}

/**
 * Service-role client. Server-only; used for reading shared plans by slug
 * without exposing a public SELECT policy on the plans table.
 */
export function createServiceClient(): SupabaseClient {
  /*
   * Typed rather than left as the `any` a bare require returns. Admin pages
   * read through this now, and an untyped client silently turns every row it
   * hands back into `any`, which removes exactly the checking those pages
   * relied on before they were switched over.
   */
  return createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
