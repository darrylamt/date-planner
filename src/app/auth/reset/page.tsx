"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

const MIN_PASSWORD = 6;

/**
 * Where a password-reset link lands. /auth/callback has already exchanged the
 * recovery code for a session by this point, so the visitor is momentarily
 * signed in purely to set a new password.
 *
 * This is also the route an account created via magic link uses to get a
 * password for the first time — those accounts have none.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(Boolean(data.session));
      setReady(true);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (err) {
      setError(err.message || "Could not set the password.");
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/plans");
      router.refresh();
    }, 1400);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col px-6">
      <div className="pt-[22px]">
        <Logo size={22} />
      </div>

      <div className="flex flex-1 flex-col justify-center pb-24">
        <div className="kente w-16" />
        <h1 className="mt-4 font-display text-stepq font-bold">Set a new password</h1>

        {!ready ? (
          <p className="mt-2 text-body text-mutedbrown">One moment…</p>
        ) : !authed ? (
          <>
            <p className="mt-2 text-body text-mutedbrown">
              This reset link has expired or was already used. Request a fresh one.
            </p>
            <a href="/login" className="btn mt-6 text-center">
              Back to sign in
            </a>
          </>
        ) : done ? (
          <div className="card mt-6 px-5 py-[18px]">
            <div className="text-[16px] font-bold">Password updated ✨</div>
            <div className="mt-1 text-[14px] text-mutedbrown">
              You&apos;re signed in. Taking you to your plans…
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <div>
              <span className="flbl">New password</span>
              <input
                type="password"
                required
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
                className="inp"
                placeholder={`At least ${MIN_PASSWORD} characters`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <span className="flbl">Confirm password</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                className="inp"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <button className="btn" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </button>
            {error && <div className="why not-italic text-staletext">{error}</div>}
          </form>
        )}
      </div>
    </main>
  );
}
