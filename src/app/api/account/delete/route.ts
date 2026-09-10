import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Delete the signed-in account and everything tied to it.
 *
 * Required by App Store guideline 5.1.1(v): an app that lets someone create an
 * account has to let them delete it from inside the app, not by emailing
 * support. Submitting without this is a rejection.
 *
 * Only ever deletes the caller's own account. The id comes from their session,
 * never from the request body, so there is no id to tamper with.
 *
 * What goes: the auth user, which cascades to their profile and their saved
 * plans. What stays: venue reports and reservation requests, whose foreign
 * keys null out instead. Those describe a venue rather than a person, and a
 * report that a place has closed is still true after its reporter leaves.
 */
export const maxDuration = 30;

/**
 * Whoever is calling, however they authenticated.
 *
 * The website sends a cookie; the native app has no cookie jar and sends a
 * bearer token instead. Reading only cookies here meant deletion from the app
 * could never work at all, which is exactly the surface the App Store requires
 * it on.
 */
async function callerId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (token) {
    const admin = createServiceClient();
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : (data.user?.id ?? null);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: Request) {
  const userId = await callerId(req);

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  // Removing an auth user is an admin operation, so it needs the service key
  // rather than the caller's own token.
  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    console.error("account deletion failed", error);
    return NextResponse.json(
      { error: "Could not delete the account. Try again shortly." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
