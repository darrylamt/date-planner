"use client";

import { useState } from "react";

/** The menu link in a box, with a Copy button. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--p-line)] bg-[var(--p-sunken)] p-2 pl-3">
      <span className="min-w-0 flex-1 truncate text-[14px]">{url}</span>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        className="h-9 shrink-0 rounded-lg bg-[var(--p-ink)] px-4 text-[14px] font-bold text-white"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
