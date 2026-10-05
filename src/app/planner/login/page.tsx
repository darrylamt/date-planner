"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { emailForUsername } from "@/lib/venueUsername";
import { Wordmark } from "@/components/planner/PlannerShell";
import { IconArrow, IconPin, IconTicket } from "@/components/planner/icons";

/**
 * The planner's door. Same usernames as the venue portal (one namespace,
 * one synthetic domain), so a venue that signs in here is simply sent to
 * its own portal.
 */
function PlannerLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notAPlanner = params.get("as") === "not-a-planner";

  async function signIn() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await createClient().auth.signInWithPassword({
      email: emailForUsername(username),
      password,
    });
    if (err) {
      setBusy(false);
      // Never "no such username": that would tell anybody which accounts exist.
      return setError("That username and password do not match.");
    }
    router.push(data.user?.user_metadata?.event_planner ? "/planner" : "/venue");
    router.refresh();
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1040px] md:grid-cols-2 md:items-center md:gap-12 md:px-6">
      {/* What this is, before the form. */}
      <section className="relative overflow-hidden px-6 pb-8 pt-6 md:rounded-[32px] md:bg-white md:p-10 md:shadow-[0_30px_60px_-30px_rgb(28_18_22/0.35)] md:ring-1 md:ring-[var(--p-line)]">
        <div>
          <Wordmark height={26} />
        </div>
        <div className="pl-up mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--p-accent-soft)] px-3 py-1.5 text-[13px] font-bold text-[var(--p-accent-dark)]">
          For event planners
        </div>
        <h1 className="pl-up mt-3 text-[34px] font-bold leading-[1.1] md:text-[42px]" style={{ animationDelay: "80ms" }}>
          Put your nights in people&apos;s plans.
        </h1>
        <p className="pl-up mt-3 text-[16px] leading-relaxed text-[var(--p-ink-2)]" style={{ animationDelay: "140ms" }}>
          When somebody in Accra or Kumasi plans an evening that fits your night, Duro builds it around you: dinner before, the ride there, your night at the heart of it.
        </p>

        <div className="pl-up mt-7 hidden max-w-[340px] md:block" style={{ animationDelay: "220ms" }}>
          <div className="rounded-[22px] bg-[var(--p-bg)] p-4 ring-1 ring-[var(--p-line)]">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-bold tracking-[0.08em] text-[var(--p-ok)]">EVENT</span>
              <span className="text-[var(--p-muted)]">Sat · 9pm</span>
            </div>
            <div className="mt-1 text-[19px] font-bold">Your night, here</div>
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--p-muted)]">
              <IconPin size={13} /> Your venue · Osu
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--p-ok)]">
              <IconTicket size={13} /> On this date only
            </div>
          </div>
        </div>
      </section>

      <section className="pl-up px-6 pb-12 md:px-0" style={{ animationDelay: "120ms" }}>
        <div className="pl-card p-5 md:p-7">
          <h2 className="text-[24px] font-bold">Sign in</h2>
          <p className="mt-1 text-[14.5px] text-[var(--p-muted)]">With the username and password we gave you.</p>

          {notAPlanner ? (
            <div className="mt-4 rounded-2xl bg-[var(--p-warn-soft)] px-4 py-3 text-[14px] text-[var(--p-warn)]">
              You are signed in, but not as an event planner. Sign in with your planner username instead.
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
              <div role="alert" className="pl-fade text-[14px] font-semibold text-[var(--p-accent-dark)]">
                {error}
              </div>
            ) : null}

            <button type="submit" className="pl-btn mt-1 w-full" disabled={busy || !username.trim() || !password}>
              {busy ? "Signing in…" : "Sign in"} {!busy ? <IconArrow size={20} /> : null}
            </button>
          </form>

          {/* No reset link: the address behind a username takes no mail. */}
          <p className="mt-5 text-[13.5px] leading-relaxed text-[var(--p-muted)]">
            Lost your password? Message us and we will give you a new one. Want a planner account?{" "}
            <a href="mailto:planbyaduro@gmail.com?subject=Duro%20planner%20account" className="font-bold text-[var(--p-accent)] underline">
              Get in touch
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}

export default function PlannerLoginPage() {
  return (
    <Suspense>
      <PlannerLoginInner />
    </Suspense>
  );
}
