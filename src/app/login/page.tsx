"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

/** Supabase's default minimum. Enforced here so the error arrives before the round trip. */
const MIN_PASSWORD = 6;

type Mode = "signin" | "signup" | "forgot";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/plans";
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
        // session — the account is not usable until the link is clicked.
        if (!data.session) {
          setNotice(
            `Almost there — confirm your address using the link we sent to ${email.trim()}, then sign in.`
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
        <div className="kente w-16" />
        <h1 className="mt-4 font-display text-stepq font-bold">{heading}</h1>
        <p className="mt-2 text-body text-mutedbrown">{blurb}</p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
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
              {error ?? "That link didn't work — try signing in instead."}
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
    return "Confirm your email address first — check your inbox for the link.";
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
