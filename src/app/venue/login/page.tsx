"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";
import { emailForUsername } from "@/lib/venueUsername";

/**
 * The portal's own door.
 *
 * Separate from /login, which now signs admins in with an email address. A
 * restaurant was given a username on a piece of paper and has no address to
 * type, and a form that asks for one is a form they close.
 */
function VenueLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Reached by somebody signed in as an ordinary app user. Not an error and
   * not worth a form: they are already signed in, just not as a venue.
   */
  const notAVenue = params.get("as") === "not-a-venue";

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: emailForUsername(username),
      password,
    });
    setBusy(false);

    if (err) {
      // Never "no such username": that tells anybody with the form which
      // venues have accounts, and the venue cannot act on the difference.
      setError("That username and password do not match.");
      return;
    }
    router.push("/venue");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col px-6">
      <div className="pt-[22px]">
        <Logo size={22} />
      </div>

      <div className="flex flex-1 flex-col justify-center pb-24">
        <div className="text-caption font-bold uppercase tracking-[0.1em] text-flame">
          For venues
        </div>
        <h1 className="mt-2 font-display text-[30px] font-bold leading-[1.2]">
          Manage your listing
        </h1>
        <p className="mt-3 text-[15px] text-mutedbrown">
          Your menu, your hours, your pictures, and the bookings people send you through aduro.
        </p>

        {notAVenue ? (
          <div className="mt-5 rounded-bar border border-line bg-cream/60 p-4 text-[14px] text-mutedbrown">
            You are signed in, but this account does not run a venue. If you were given a venue
            username, sign in with that instead.
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col">
            <span className="flbl">Username</span>
            <input
              className="inp"
              value={username}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="the name we gave you"
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void signIn()}
            />
          </label>

          <label className="flex flex-col">
            <span className="flbl">Password</span>
            <input
              className="inp"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void signIn()}
            />
          </label>

          {error ? <div className="text-[14px] font-semibold text-flame">{error}</div> : null}

          <button
            className="btn mt-1"
            disabled={busy || !username.trim() || !password}
            onClick={() => void signIn()}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>

        {/*
          No "forgot password" link, and that is deliberate rather than
          missing: the address behind a venue username receives no mail, so a
          reset email would be sent into a hole. An admin reissues instead.
        */}
        <p className="mt-6 text-[13px] text-mutedbrown">
          Lost your password? Ask us and we will issue a new one. We cannot email it to you,
          because your login is a username rather than an address.
        </p>
      </div>
    </main>
  );
}

export default function VenueLoginPage() {
  return (
    <Suspense>
      <VenueLoginInner />
    </Suspense>
  );
}
