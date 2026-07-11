"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

/** Magic-link sign in — light auth only, no passwords. */
function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/plans";
  const linkError = params.get("error") === "link";

  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setState(error ? "error" : "sent");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col px-6">
      <div className="pt-[22px]">
        <Logo size={22} />
      </div>

      <div className="flex flex-1 flex-col justify-center pb-24">
        <div className="kente w-16" />
        <h1 className="mt-4 font-display text-stepq font-bold">Sign in with a magic link</h1>
        <p className="mt-2 text-body text-mutedbrown">
          No passwords. We&apos;ll email you a link that signs you straight in.
        </p>

        {state === "sent" ? (
          <div className="card mt-6 px-5 py-[18px]">
            <div className="text-[16px] font-bold">Check your inbox ✨</div>
            <div className="mt-1 text-[14px] text-mutedbrown">
              We sent a sign-in link to <b className="text-ink">{email}</b>. Open it on this
              device to continue.
            </div>
          </div>
        ) : (
          <form onSubmit={sendLink} className="mt-6 flex flex-col gap-3">
            <div>
              <span className="flbl">Email</span>
              <input
                type="email"
                required
                className="inp"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button className="btn" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Email me a link"}
            </button>
            {(state === "error" || linkError) && (
              // Validation message extended in the design's visual language.
              <div className="why not-italic text-staletext">
                That didn&apos;t work — check the address and try again.
              </div>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
