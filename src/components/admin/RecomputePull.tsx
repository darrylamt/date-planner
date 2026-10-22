"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Runs the nightly pull now, then redraws the page with what it wrote. */
export function RecomputePull() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/admin/pull", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setNote(`Worked out ${body.venues} venues from ${body.signals} signals.`);
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-3">
      {note ? <span className="text-[13px] text-mutedbrown">{note}</span> : null}
      <button type="button" className="btn2 btnsm" onClick={run} disabled={busy}>
        {busy ? "Working it out…" : "Recompute now"}
      </button>
    </div>
  );
}
