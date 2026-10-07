"use client";

import { useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/planner/PlannerShell";

/**
 * A cake or flower shop asks to be listed. Nothing goes live from here: an
 * admin reads it, checks the shop, and approving it creates their login.
 * No photo upload, because uploads need an account; their Instagram does
 * that job until they sign in.
 */
export default function VendorApplyPage() {
  const [f, setF] = useState({
    businessName: "",
    kind: "" as "" | "cake" | "flowers",
    contactName: "",
    phone: "",
    whatsappPhone: "",
    instagramHandle: "",
    area: "",
    note: "",
    website: "", // a field people never see; bots fill it
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: v }));

  async function send() {
    if (f.businessName.trim().length < 2) return setError("What is your shop called?");
    if (!f.kind) return setError("Do you sell cakes or flowers?");
    if (f.phone.trim().length < 9) return setError("Add a phone number we can reach you on.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/vendor/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("That did not send. Check your connection and try again.");
    setSent(true);
  }

  return (
    <main className="mx-auto w-full max-w-[560px] px-5 pb-16 pt-6">
      <Link href="/vendor/login" aria-label="Duro! for vendors">
        <Wordmark height={24} />
      </Link>

      {sent ? (
        <div className="pl-pop pl-card mt-10 p-6 text-center">
          <div className="text-[44px]">🎂💐</div>
          <h1 className="mt-2 text-[26px] font-bold">Thank you</h1>
          <p className="mt-2 text-[15.5px] leading-relaxed text-[var(--p-ink-2)]">
            We will look at {f.businessName.trim()} and get back to you on {f.phone.trim()}, usually within two days. When you are approved, we send you a login to add your {f.kind === "cake" ? "cakes" : "bouquets"} and prices.
          </p>
        </div>
      ) : (
        <>
          <h1 className="pl-up mt-8 text-[30px] font-bold leading-tight">Sell your cakes and flowers on Duro!</h1>
          <p className="pl-up mt-2 text-[15.5px] leading-relaxed text-[var(--p-ink-2)]" style={{ animationDelay: "60ms" }}>
            People planning birthdays, dates and anniversaries add a cake or bouquet to their plan, and Duro works the pickup from you into their route. It is free to be listed. They order and pay you directly.
          </p>

          <form
            className="pl-up pl-card mt-6 flex flex-col gap-5 p-5"
            style={{ animationDelay: "120ms" }}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="block">
              <span className="pl-label">Shop name</span>
              <input className="pl-input" value={f.businessName} onChange={(e) => set("businessName", e.target.value)} />
            </label>

            <div>
              <span className="pl-label">You sell</span>
              <div className="flex gap-2">
                {(["cake", "flowers"] as const).map((k) => (
                  <button key={k} type="button" className="pl-chip" aria-pressed={f.kind === k} onClick={() => set("kind", k)}>
                    {k === "cake" ? "🎂 Cakes" : "💐 Flowers"}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="pl-label">Your name</span>
              <input className="pl-input" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </label>
            <label className="block">
              <span className="pl-label">Phone</span>
              <input className="pl-input" inputMode="tel" placeholder="+233 …" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
            </label>
            <label className="block">
              <span className="pl-label">WhatsApp, if different</span>
              <input className="pl-input" inputMode="tel" value={f.whatsappPhone} onChange={(e) => set("whatsappPhone", e.target.value)} />
            </label>
            <label className="block">
              <span className="pl-label">Instagram</span>
              <input className="pl-input" placeholder="@yourshop" autoCapitalize="none" value={f.instagramHandle} onChange={(e) => set("instagramHandle", e.target.value)} />
              <span className="pl-hint mt-1.5 block">The quickest way for us to see your work.</span>
            </label>
            <label className="block">
              <span className="pl-label">Where are you?</span>
              <input className="pl-input" placeholder="East Legon, Accra" value={f.area} onChange={(e) => set("area", e.target.value)} />
            </label>
            <label className="block">
              <span className="pl-label">Anything else? Optional</span>
              <textarea className="pl-input min-h-[96px]" maxLength={600} value={f.note} onChange={(e) => set("note", e.target.value)} />
            </label>
            <input
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              value={f.website}
              onChange={(e) => set("website", e.target.value)}
            />

            {error ? (
              <div role="alert" className="text-[14px] font-semibold text-[var(--p-accent-dark)]">
                {error}
              </div>
            ) : null}
            <button type="submit" className="pl-btn w-full" disabled={busy}>
              {busy ? "Sending…" : "Send"}
            </button>
          </form>

          <p className="mt-5 text-center text-[14px] text-[var(--p-muted)]">
            Already listed?{" "}
            <Link href="/vendor/login" className="font-bold text-[var(--p-accent)] underline">
              Sign in
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
