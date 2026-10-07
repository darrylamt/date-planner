"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Switch, useToast } from "./ui";

/**
 * Showing in plans, or hidden: the one switch a venue reaches for when it
 * closes for a week. Everything else is kept while it is off.
 */
export function ShowToggle({ venueId, active }: { venueId: string; active: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(active);
  const [busy, setBusy] = useState(false);
  const { say, toast } = useToast();

  async function flip(next: boolean) {
    if (!next && !confirm("Hide your place from plans? Nobody is sent to you until you switch it back on. Your menu, hours and photos are kept.")) return;
    setOn(next);
    setBusy(true);
    const { error } = await createClient().from("venues").update({ is_active: next }).eq("id", venueId);
    setBusy(false);
    if (error) {
      setOn(!next);
      return say("That did not save. Try again.", false);
    }
    say(next ? "You're back in plans" : "Hidden from plans");
    router.refresh();
  }

  return (
    <div
      className={`pl-up flex items-center gap-4 rounded-[20px] px-5 py-4 transition-colors duration-300 ${
        on ? "bg-[var(--p-ok-soft)]" : "bg-[var(--p-warn-soft)]"
      }`}
      style={{ animationDelay: "60ms" }}
    >
      <span className="relative grid h-3 w-3 shrink-0 place-items-center">
        {on ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--p-ok)] opacity-60" /> : null}
        <span className={`relative inline-flex h-3 w-3 rounded-full ${on ? "bg-[var(--p-ok)]" : "bg-[var(--p-warn)]"}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[16px] font-bold ${on ? "text-[var(--p-ok)]" : "text-[var(--p-warn)]"}`}>
          {on ? "Showing in plans" : "Hidden from plans"}
        </span>
        <span className="block text-[13.5px] leading-snug text-[var(--p-ink-2)]">
          {on ? "People planning an evening near you can be sent here." : "Switch on when you're open again. Everything is kept."}
        </span>
      </span>
      <Switch on={on} onChange={(n) => void flip(n)} label="Show in plans" disabled={busy} />
      {toast}
    </div>
  );
}
