"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { safeNextPath } from "@/lib/safeHref";
import { AuthErrorNotice } from "@/components/AuthErrorNotice";

/** Supabase's default minimum. Enforced here so the error arrives before the round trip. */
const MIN_PASSWORD = 6;

type Mode = "signin" | "signup" | "forgot";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  /*
   * Admin, because that is the only thing left to sign in to here. The web
   * kept a consumer account area; people plan in the app now, and the only
   * reason to have a session in this browser is to run the catalogue.
   */
  const next = safeNextPath(params.get("next"), "/admin");
  const linkError = params.get("error") === "link";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    try {
      if (mode === "forgot") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
        });
        if (err) throw err;
        setNotice(
          `If an account exists for ${email.trim()}, a reset link is on its way.`
        );
        return;
      }

      if (mode === "signup") {
        if (password.length < MIN_PASSWORD) {
          setError(`Password must be at least ${MIN_PASSWORD} characters.`);
          return;
        }
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) throw err;

        // With "Confirm email" on in Supabase, signUp returns a user but no
        // session, the account is not usable until the link is clicked.
        if (!data.session) {
          setNotice(
            `Almost there, confirm your address using the link we sent to ${email.trim()}, then sign in.`
          );
          return;
        }
        router.push(next);
        router.refresh();
        return;
      }

      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  /*
   * Google and Apple, as in the app, so somebody buying Pro on the website
   * signs in to the account they already have there (owner, 15 Nov 2026).
   * Supabase sends them back through /auth/callback, which finishes the
   * session and continues to `next`.
   */
  async function oauth(provider: "google" | "apple") {
    setError(null);
    setBusy(true);
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  const heading =
    mode === "signin"
      ? "Sign in"
      : mode === "signup"
        ? "Create an account"
        : "Reset your password";

  const blurb =
    mode === "signin"
      ? "Welcome back."
      : mode === "signup"
        ? "You only need an account to save and share plans."
        : "We'll email you a link to set a new one.";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col px-6">
      <div className="pt-[22px]">
        <Logo size={22} />
      </div>

      <div className="flex flex-1 flex-col justify-center pb-24">
        <AuthErrorNotice />

        <h1 className="font-display text-stepq font-bold">{heading}</h1>
        <p className="mt-2 text-body text-mutedbrown">{blurb}</p>

        {mode !== "forgot" ? (
          <div className="mt-6 flex flex-col gap-3">
            {/* Apple on the web waits for its Services ID and secret in Supabase (owner, 15 Nov 2026). */}
            {process.env.NEXT_PUBLIC_APPLE_WEB_SIGNIN === "1" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => oauth("apple")}
              className="flex h-[52px] items-center justify-center gap-2.5 rounded-btn bg-ink px-6 text-[16px] font-semibold text-cream disabled:opacity-60"
            >
              <svg width="17" height="20" viewBox="0 0 17 20" aria-hidden="true" fill="currentColor">
                <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM11.6 3c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z" />
              </svg>
              Continue with Apple
            </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => oauth("google")}
              className="flex h-[52px] items-center justify-center gap-2.5 rounded-btn border-[1.5px] border-line bg-shell px-6 text-[16px] font-semibold text-ink disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
              </svg>
              Continue with Google
            </button>
            <div className="my-1 flex items-center gap-3 text-caption text-mutedbrown">
              <span className="h-px flex-1 bg-line" />
              or with email
              <span className="h-px flex-1 bg-line" />
            </div>
          </div>
        ) : null}

        <form onSubmit={submit} className={`${mode === "forgot" ? "mt-6" : ""} flex flex-col gap-3`}>
          <div>
            <span className="flbl">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              className="inp"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode !== "forgot" && (
            <div>
              <span className="flbl">Password</span>
              <input
                type="password"
                required
                minLength={MIN_PASSWORD}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="inp"
                placeholder={
                  mode === "signup" ? `At least ${MIN_PASSWORD} characters` : "••••••••"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          <button className="btn" disabled={busy}>
            {busy
              ? "One moment…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Email me a reset link"}
          </button>

          {notice && <div className="why not-italic">{notice}</div>}
          {(error || linkError) && (
            <div className="why not-italic text-staletext">
              {error ?? "That link didn't work, try signing in instead."}
            </div>
          )}
        </form>

        <div className="mt-6 flex flex-col gap-2 text-[14px] text-mutedbrown">
          {mode === "signin" && (
            <>
              <button
                type="button"
                className="text-left font-semibold text-flame hover:text-flame-dark"
                onClick={() => switchMode("signup")}
              >
                Create an account
              </button>
              <button
                type="button"
                className="text-left font-semibold text-flame hover:text-flame-dark"
                onClick={() => switchMode("forgot")}
              >
                Forgot your password?
              </button>
            </>
          )}
          {mode !== "signin" && (
            <button
              type="button"
              className="text-left font-semibold text-flame hover:text-flame-dark"
              onClick={() => switchMode("signin")}
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

/** Supabase messages are terse and sometimes leak internals; map the common ones. */
function friendlyAuthError(err: unknown): string {
  const message = (err as { message?: string })?.message ?? "";
  if (/invalid login credentials/i.test(message)) {
    return "That email and password don't match. If you signed up with a magic link before, use “Forgot your password?” to set one.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Confirm your email address first, check your inbox for the link.";
  }
  if (/already registered|already been registered/i.test(message)) {
    return "There's already an account with that address. Try signing in.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return message || "Something went wrong. Try again.";
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
