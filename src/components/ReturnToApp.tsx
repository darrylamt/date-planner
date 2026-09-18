"use client";

import { useEffect, useState } from "react";

/**
 * Catch a sign-in that landed on the website by mistake, and finish it.
 *
 * ── what goes wrong ─────────────────────────────────────────────────────
 * Google sign-in in the app opens a browser and asks Supabase to send the
 * result back to aduro://auth. Supabase only honours a redirect target that is
 * on its allow-list, and silently falls back to the project's Site URL when it
 * is not. The Site URL is this website, so the tokens arrive here: the person
 * sees a marketing page, the app never hears anything, and nothing anywhere
 * reports a failure.
 *
 * Apple sign-in is unaffected and always has been, because it exchanges a
 * native identity token and never opens a browser at all. That is why this
 * could sit broken without anybody noticing.
 *
 * ── what this does ──────────────────────────────────────────────────────
 * The real fix is the allow-list, in the Supabase dashboard. This is the net
 * underneath it: the fragment is already in this browser, so handing it
 * straight back to the app over the custom scheme exposes nothing new and
 * rescues the session instead of stranding it.
 *
 * Kept as a button rather than an automatic jump alone, because iOS blocks a
 * scheme redirect that no one asked for, and a page that silently tries and
 * fails is the exact problem this exists to solve.
 */
export function ReturnToApp() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(hash);

    /*
     * Only a real session, not an error. Errors are AuthErrorNotice's job and
     * sending one back to the app would just move the failure.
     */
    const hasTokens = Boolean(fragment.get("access_token"));
    const code = query.get("code");
    if (!hasTokens && !code) return;

    setTarget(hasTokens ? `aduro://auth#${hash}` : `aduro://auth?code=${encodeURIComponent(code!)}`);

    /*
     * Out of the address bar immediately. These are live credentials, and a
     * URL sits in history, in the tab title, and in anything that syncs
     * either. The value is already held in state above.
     */
    const clean = new URL(window.location.href);
    clean.search = "";
    clean.hash = "";
    window.history.replaceState({}, "", clean.toString());
  }, []);

  if (!target) return null;

  return (
    <div className="mb-5 rounded-card border border-flame/40 bg-sand px-5 py-4">
      <div className="text-[15px] font-bold">You are signed in. Finish in the app.</div>
      <p className="mt-1 text-[14px] leading-relaxed text-cocoa">
        Google sent you here instead of back to aduro. Tap below and the app will pick up where
        you left off.
      </p>
      <a href={target} className="btn mt-3 inline-block px-7">
        Open aduro
      </a>
      <p className="mt-2 text-[12.5px] text-mutedbrown">
        Nothing happens? The app may not be installed on this device. Sign in with Apple, or with
        your email, from the app itself.
      </p>
    </div>
  );
}
