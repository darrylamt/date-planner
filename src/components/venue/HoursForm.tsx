"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import { HoursEditor } from "@/components/admin/HoursEditor";
import type { OpeningPeriod } from "@/lib/hours";

/**
 * Opening hours, saved by the venue itself.
 *
 * The grid is the admin's, unchanged, because it already handles the two
 * things that matter: a day that is shut all day, and a day Google gave two
 * windows that this grid refuses to flatten. Rebuilding it here would have
 * meant a second implementation of the same subtlety, and the second one
 * always loses the subtlety.
 *
 * What differs is what happens on save. An admin edit leaves Google's own
 * rendering of the hours in place; a venue edit clears it, because the text
 * was Google's description of periods that no longer apply and the venue is a
 * better source than Google about its own door.
 */
export function HoursForm({ venueId, raw }: { venueId: string; raw: unknown }) {
  const supabase = createClient();
  const [periods, setPeriods] = useState<OpeningPeriod[] | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function save() {
    // Nothing touched, so nothing to write. Saving here would blank the text
    // for a venue that opened the page and changed their mind.
    if (periods === undefined) {
      setToast("Nothing changed yet.");
      setTimeout(() => setToast(null), 2500);
      return;
    }

    setBusy(true);
    const { error } = await supabase
      .from("venues")
      .update({
        opening_periods: periods,
        opening_hours_text: null,
        hours_synced_at: new Date().toISOString(),
      })
      .eq("id", venueId);
    setBusy(false);

    setToast(error ? `Could not save: ${error.message}` : "Hours saved");
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="card p-5">
      <HoursEditor raw={periods === undefined ? raw : periods} onChange={setPeriods} />

      <div className="mt-5 flex justify-end">
        <button className="btn px-8" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save hours"}
        </button>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
