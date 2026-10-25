"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { staffEmail } from "@/lib/staffRoles";
import { Logo } from "@/components/Logo";

/**
 * The door for staff logins (0095): a username and password, handed over
 * from /admin/team. The owner's own admin account signs in the usual way,
 * linked below. Lands on /admin, which sends each login to its own desk.
 */
export default function StaffLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithPassword({ email: staffEmail(username), password });
    if (err) {
      setBusy(false);
      // Never "no such username": that would say which logins exist.
      return setError("That username and password do not match.");
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="admin flex min-h-screen items-center justify-center px-4">
      <main className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-2">
          <Logo size={22} href={null} />
          <span className="adm-brand-tag">Team</span>
        </div>
        <form onSubmit={signIn} className="card p-6">
          <h1 className="!text-[22px]">Sign in</h1>
          <p className="mt-1 text-[14px] text-mutedbrown">With the username and password you were given.</p>
          <label className="flbl mt-5">Username</label>
          <input
            className="inp"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.trim().toLowerCase())}
          />
          <label className="flbl mt-3">Password</label>
          <input className="inp" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error ? <p className="mt-3 text-[14px] text-staletext">{error}</p> : null}
          <button type="submit" className="btn mt-5 w-full" disabled={busy || !username || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-[13px] text-mutedbrown">
          The owner?{" "}
          <Link href="/login?next=/admin" className="underline">
            Sign in with your own account
          </Link>
        </p>
      </main>
    </div>
  );
}
