"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { emailForUsername } from "@/lib/venueUsername";
import { Wordmark } from "@/components/planner/PlannerShell";
import { IconArrow } from "@/components/planner/icons";

/**
 * The cake and flower vendor's door. Same username namespace as venues and
 * planners, so anybody who signs in at the wrong door is sent to their own.
 */
function VendorLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notAVendor = params.get("as") === "not-a-vendor";

  async function signIn() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await createClient().auth.signInWithPassword({
      email: emailForUsername(username),
      password,
    });
    if (err) {
      setBusy(false);
      return setError("That username and password do not match.");
    }
    const meta = data.user?.user_metadata ?? {};
    router.push(meta.gift_vendor ? "/vendor" : meta.event_planner ? "/planner" : "/venue");
    router.refresh();
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1040px] md:grid-cols-2 md:items-center md:gap-12 md:px-6">
      <section className="px-6 pb-8 pt-6 md:p-10">
        <Wordmark height={26} />
        <div className="pl-up mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--p-accent-soft)] px-3 py-1.5 text-[13px] font-bold text-[var(--p-accent-dark)]">
          For cake and flower shops
        </div>
        <h1 className="pl-up mt-3 text-[34px] font-bold leading-[1.1] md:text-[42px]" style={{ animationDelay: "80ms" }}>
          Be the cake at the birthday. The flowers on the date.
        </h1>
        <p className="pl-up mt-3 text-[16px] leading-relaxed text-[var(--p-ink-2)]" style={{ animationDelay: "140ms" }}>
          When somebody plans a birthday or a date on Duro, they can add a cake or a bouquet from you to the plan, with the pickup worked into the route.
        </p>
      </section>

      <section className="pl-up px-6 pb-12 md:px-0" style={{ animationDelay: "120ms" }}>
        <div className="pl-card p-5 md:p-7">
          <h2 className="text-[24px] font-bold">Sign in</h2>
          <p className="mt-1 text-[14.5px] text-[var(--p-muted)]">With the username and password we sent you.</p>

          {notAVendor ? (
            <div className="mt-4 rounded-2xl bg-[var(--p-warn-soft)] px-4 py-3 text-[14px] text-[var(--p-warn)]">
              You are signed in, but not as a cake or flower shop. Sign in with your shop&apos;s username instead.
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

          <p className="mt-5 text-[13.5px] leading-relaxed text-[var(--p-muted)]">
            Lost your password? Message us and we will give you a new one.
          </p>
          <Link href="/vendor/apply" className="pl-btn-ghost mt-4 w-full">
            Not listed yet? Apply, it is free
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function VendorLoginPage() {
  return (
    <Suspense>
      <VendorLoginInner />
    </Suspense>
  );
}
