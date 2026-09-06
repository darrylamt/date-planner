"use client";

import { useEffect, useState } from "react";

/**
 * Surfaces auth errors that Supabase returns by redirect.
 *
 * Supabase reports these twice — once in the query string and once in the hash
 * fragment — and a hash is invisible to the server, so this has to run on the
 * client. Without it a failed reset link lands on a page with no explanation
 * at all, which is exactly when someone needs one.
 */
export function AuthErrorNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search);
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

    const code = fromQuery.get("error_code") ?? fromHash.get("error_code");
    const description =
      fromQuery.get("error_description") ?? fromHash.get("error_description");

    if (!code && !description) return;

    setMessage(explain(code, description));

    // Clear the error out of the URL so a refresh does not resurrect it.
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    window.history.replaceState({}, "", url.toString());
  }, []);

  if (!message) return null;

  return (
    <div className="mb-5 rounded-card border border-staletext/40 bg-avoidbg px-5 py-4">
      <div className="text-[15px] font-bold text-staletext">That link didn&apos;t work</div>
      <p className="mt-1 text-[14px] leading-relaxed text-cocoa">{message}</p>
    </div>
  );
}

function explain(code: string | null, description: string | null): string {
  if (code === "otp_expired") {
    return "The link had already been used or had expired — they only work once, and for a short while. Request a fresh one below. If it keeps happening, your email provider may be opening links automatically before you do.";
  }
  if (code === "access_denied") {
    return "The link was rejected. Request a new one below.";
  }
  return description?.replace(/\+/g, " ") ?? "Request a new link below.";
}
