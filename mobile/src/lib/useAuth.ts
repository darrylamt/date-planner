import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface AuthState {
  session: Session | null;
  /** True until the stored session has been read from disk. */
  loading: boolean;
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

  return { session, loading };
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

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
