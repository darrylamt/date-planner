"use client";

import { useState } from "react";

/** The two plans, and off to Paystack's checkout for the one chosen. */
export function SubscribeButtons({ monthly, yearly, saving }: { monthly: number | null; yearly: number | null; saving: number | null }) {
  const [busy, setBusy] = useState<"monthly" | "yearly" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(plan: "monthly" | "yearly") {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch("/api/paystack/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      const j = (await res.json()) as { url?: string; message?: string; error?: string };
      if (j.url) {
        window.location.href = j.url;
        return;
      }
      setError(j.message ?? (j.error === "sign_in_required" ? "Please sign in again." : "Something went wrong. Please try again."));
    } catch {
      setError("We couldn't reach the payment page. Check your connection and try again.");
    }
    setBusy(null);
  }

  const ghs = (n: number | null) => (n == null ? "" : `GH₵${Number.isInteger(n) ? n : n.toFixed(2)}`);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={() => start("yearly")} disabled={busy !== null} className="card relative flex flex-col items-start p-5 text-left ring-2 ring-flame">
        {saving && saving > 0 ? <span className="absolute right-4 top-4 rounded-chip bg-flame px-3 py-1 text-[12px] font-bold text-blush">Save {saving}%</span> : null}
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mutedbrown">Yearly</span>
        <span className="mt-1 font-display text-[28px] font-bold">{ghs(yearly)}</span>
        <span className="text-[13px] text-cocoa">a year{yearly ? `, about ${ghs(Math.round(yearly / 12))} a month` : ""}</span>
        <span className="btn mt-4 w-full">{busy === "yearly" ? "Opening…" : "Choose yearly"}</span>
      </button>
      <button type="button" onClick={() => start("monthly")} disabled={busy !== null} className="card flex flex-col items-start p-5 text-left">
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mutedbrown">Monthly</span>
        <span className="mt-1 font-display text-[28px] font-bold">{ghs(monthly)}</span>
        <span className="text-[13px] text-cocoa">a month</span>
        <span className="btn2 mt-4 w-full">{busy === "monthly" ? "Opening…" : "Choose monthly"}</span>
      </button>
      {error ? <p className="text-[13px] text-flame sm:col-span-2">{error}</p> : null}
    </div>
  );
}
