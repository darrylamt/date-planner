import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { clearDraft } from "./draft";

export interface AuthState {
  session: Session | null;
  /** True until the stored session has been read from disk. */
  loading: boolean;
  /**
   * Signed in without an account.
   *
   * App Review rejected aduro under 5.1.1(v) for requiring registration to
   * buy Pro, which is not account-based content. So somebody who wants to buy
   * without registering is given a user id on the spot and no email, no name,
   * nothing. The session is real -- it is what the purchase, the webhook and
   * the chat meter all key on -- but it is not an account, and screens that
   * show account things (the identity card, Sign out, Delete account) treat it
   * as signed out.
   */
  anonymous: boolean;
}

/** Subscribes to Supabase auth so screens re-render on sign in/out. */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading, anonymous: session?.user?.is_anonymous === true };
}

/**
 * A user id for somebody without an account, made when they need one.
 *
 * Only on the way to buying something or asking the assistant -- never at
 * launch -- so browsing leaves no trace. Needs anonymous sign-ins turned on in
 * the Supabase dashboard; without that this returns null and the paywall says
 * subscriptions are unavailable rather than crashing.
 */
export async function ensureSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn("anonymous sign-in failed", error.message);
    return null;
  }
  return anon.user?.id ?? null;
}

/** Supabase's default minimum. Checked here so the error is instant. */
export const MIN_PASSWORD = 6;

export interface AuthOutcome {
  error: string | null;
  /**
   * True when the account was created but needs an emailed confirmation
   * before it can be used, Supabase's "Confirm email" setting decides this.
   */
  needsConfirmation?: boolean;
}

export async function signIn(email: string, password: string): Promise<AuthOutcome> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  return { error: error ? friendlyAuthError(error.message) : null };
}

export async function signUp(email: string, password: string): Promise<AuthOutcome> {
  if (password.length < MIN_PASSWORD) {
    return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) return { error: friendlyAuthError(error.message) };
  // No session means the address has to be confirmed before signing in.
  return { error: null, needsConfirmation: !data.session };
}

/**
 * Password reset. The emailed link opens the web app rather than the app
 * itself, recovery needs a one-time code exchanged in a browser, and routing
 * that through a deep link buys complexity without buying anything else.
 */
export async function sendPasswordReset(email: string): Promise<AuthOutcome> {
  const webUrl = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo: `${webUrl}/auth/callback?next=/auth/reset` }
  );
  return { error: error ? friendlyAuthError(error.message) : null };
}

/** Supabase messages are terse; map the ones people actually hit. */
function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "That email and password don't match. If you used a sign-in link before, reset your password to set one.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Confirm your email address first, check your inbox.";
  }
  if (/already registered|already been registered/i.test(message)) {
    return "There's already an account with that address. Try signing in.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return message || "Something went wrong. Try again.";
}

/**
 * Sign out, and leave nothing of this account behind on the device.
 *
 * The session was the only thing being cleared, so the in-progress plan stayed
 * in storage and the next account to sign in on the same phone saw it on the
 * home screen: the same title, the same photograph, the partner's name still
 * in the inputs. Deleting the plan from the first account did not remove it,
 * because it had never come from the server.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  await clearDraft();
}
