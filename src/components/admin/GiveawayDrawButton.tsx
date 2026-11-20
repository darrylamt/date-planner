"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Admin → Giveaways: draw one of those who tried, now. Busy, then Done or the reason. */
export function GiveawayDrawButton({ eventId, entries }: { eventId: string; entries: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="btn2 btnsm"
        disabled={state === "busy" || !entries}
        onClick={async () => {
          if (!confirm(`Draw a winner now from the ${entries} who tried? Everyone who tried will be told.`)) return;
          setState("busy");
          const res = await fetch("/api/admin/giveaways/draw", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId }),
          }).catch(() => null);
          const json = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
          if (res?.ok && json?.ok) {
            setState("done");
            router.refresh();
          } else setState(json?.error ?? "That didn't work. Try again.");
        }}
      >
        {state === "busy" ? "Drawing…" : state === "done" ? "Done" : "Draw now"}
      </button>
      {state !== "idle" && state !== "busy" && state !== "done" ? <span className="text-[13px] text-flame">{state}</span> : null}
    </div>
  );
}
