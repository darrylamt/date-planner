"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { emailForUsername } from "@/lib/venueUsername";
import { Wordmark } from "@/components/planner/PlannerShell";
import { IconArrow, IconCheck } from "@/components/planner/icons";

/**
 * The portal's own door. A restaurant was given a username, not an email
 * address, so that is all this asks for. One username namespace across
 * venues, planners and vendors, so anybody at the wrong door is sent on.
 */
function VenueLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notAVenue = params.get("as") === "not-a-venue";

  async function signIn() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await createClient().auth.signInWithPassword({
      email: emailForUsername(username),
      password,
    });
    if (err) {
      setBusy(false);
      // Never "no such username": that would tell anybody which venues have accounts.
      return setError("That username and password do not match.");
    }
    const meta = data.user?.user_metadata ?? {};
    router.push(meta.gift_vendor ? "/vendor" : meta.event_planner ? "/planner" : "/venue");
    router.refresh();
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1040px] md:grid-cols-2 md:items-center md:gap-12 md:px-6">
      <section className="px-6 pb-6 pt-6 md:p-10">
        <div>
          <Wordmark height={26} />
        </div>
        <div className="pl-up mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--p-accent-soft)] px-3 py-1.5 text-[13px] font-bold text-[var(--p-accent-dark)]">
          For restaurants, bars and venues
        </div>
        <h1 className="pl-up mt-3 text-[34px] font-bold leading-[1.1] md:text-[42px]" style={{ animationDelay: "80ms" }}>
          Be the place in their plan.
        </h1>
        <p className="pl-up mt-3 text-[16px] leading-relaxed text-[var(--p-ink-2)]" style={{ animationDelay: "140ms" }}>
          Keep your menu, hours and nights right, and see the bookings Duro sends you.
        </p>
        <ul className="mt-6 hidden flex-col gap-2.5 md:flex">
          {["Change a price in seconds", "Set your hours, close for a day", "Put your live band or karaoke night on", "See who asked for a table"].map((t, i) => (
            <li key={t} className="pl-up flex items-center gap-3 text-[15.5px] font-semibold" style={{ animationDelay: `${220 + i * 80}ms` }}>
              <span className="pl-pop grid h-7 w-7 place-items-center rounded-full bg-[var(--p-ok)] text-white" style={{ animationDelay: `${320 + i * 80}ms` }}>
                <IconCheck size={14} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section className="pl-up px-6 pb-12 md:px-0" style={{ animationDelay: "120ms" }}>
        <div className="pl-card p-5 md:p-7">
          <h2 className="text-[24px] font-bold">Sign in</h2>
          <p className="mt-1 text-[14.5px] text-[var(--p-muted)]">With the username and password we gave you.</p>

          {notAVenue ? (
            <div className="mt-4 rounded-2xl bg-[var(--p-warn-soft)] px-4 py-3 text-[14px] text-[var(--p-warn)]">
              You&apos;re signed in, but not with a venue&apos;s login. Sign in with your venue&apos;s username instead.
            </div>
          ) : null}

          <form
            className="mt-5 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void signIn();
            }}
          >
            <label className="block">
              <span className="pl-label">Username</span>
              <input
                className="pl-input"
                value={username}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="the name we gave you"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="pl-label">Password</span>
              <div className="relative">
                <input
                  className="pl-input !pr-20"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[13px] font-bold text-[var(--p-muted)]"
                  onClick={() => setShow((s) => !s)}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            {error ? (
              <div role="alert" className="pl-fade pl-wiggle text-[14px] font-semibold text-[var(--p-accent-dark)]">
                {error}
              </div>
            ) : null}

            <button type="submit" className="pl-btn mt-1 w-full" disabled={busy || !username.trim() || !password}>
              {busy ? "Signing in…" : "Sign in"} {!busy ? <IconArrow size={20} /> : null}
            </button>
          </form>

          {/* No reset link: the address behind a username takes no mail. */}
          <p className="mt-5 text-[13.5px] leading-relaxed text-[var(--p-muted)]">
            Lost your password? Message us and we&apos;ll give you a new one. Not listed yet?{" "}
            <a href="mailto:planbyaduro@gmail.com?subject=Listing%20on%20Duro!" className="font-bold text-[var(--p-accent)] underline">
              Get in touch
            </a>
            .
          </p>
        </div>
      </section>
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
