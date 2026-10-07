"use client";

import { useEffect, useState } from "react";
import { trackShare } from "@/lib/shareEvents";

/** The page's one open, counted once, like a shared plan's. */
export function BillView() {
  useEffect(() => trackShare("view", "split"), []);
  return null;
}

/** The MoMo number, copyable in one tap so nobody retypes it wrong. */
export function CopyNumber({ number }: { number: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(number.replace(/\s+/g, "")).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="mt-3 flex w-full items-center justify-between rounded-[16px] border border-line bg-shell/70 px-4 py-3.5 text-left transition-colors hover:border-flame"
    >
      <span className="font-mono text-[20px] font-bold tracking-wide text-ink">{number}</span>
      <span className="rounded-full bg-flame px-3 py-1 text-[13px] font-bold text-blush">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
