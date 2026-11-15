"use client";

import { useState } from "react";

/** A caption with a Copy button. */
export function CopyBox({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="adm-section-title">{title}</h2>
        <button
          type="button"
          className="btn btnsm"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-black/[0.03] p-3 text-[13px] leading-relaxed">{text}</pre>
    </div>
  );
}
