"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import { longDate } from "@/lib/format";
import type { ReservationRequest, ReservationStatus } from "@/lib/types";

/**
 * The bookings people sent you.
 *
 * The only screen here that is not data entry, and the reason a venue opens
 * the portal on a day when nothing about its listing has changed.
 *
 * Marking one confirmed sends nothing to the guest, and the page says so
 * rather than leaving it to be discovered: the request reached the venue over
 * WhatsApp, the conversation lives there, and a status that silently implied a
 * message had gone out would be the worst possible thing to get wrong about a
 * table somebody is expecting.
 */
const SETTABLE: { value: ReservationStatus; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Can't do it" },
];

const STATUS_LABEL: Record<string, string> = {
  requested: "New",
  sent: "New",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
};

export function ReservationsInbox({ rows }: { rows: ReservationRequest[] }) {
  const supabase = createClient();
  const [state, setState] = useState<Record<string, ReservationStatus>>(
    () => Object.fromEntries(rows.map((r) => [r.id, r.status]))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function set(id: string, status: ReservationStatus) {
    const previous = state[id];
    setState((s) => ({ ...s, [id]: status }));
    setBusy(id);
    /*
     * Only the status column is granted, so an attempt to change anything else
     * about a booking is refused by Postgres rather than by this component
     * choosing not to send it.
     */
    const { error } = await supabase
      .from("reservation_requests")
      .update({ status })
      .eq("id", id);
    setBusy(null);

    if (error) {
      // Put it back. A row that looks confirmed on screen and is not in the
      // database is how a table gets given away twice.
      setState((s) => ({ ...s, [id]: previous }));
      setToast(`Could not save that: ${error.message}`);
      setTimeout(() => setToast(null), 3500);
    }
  }

  if (!rows.length) {
    return (
      <p className="rounded-bar border border-line bg-cream/60 p-5 text-[14px] text-mutedbrown">
        No bookings yet. They will appear here the moment somebody asks for a table at your place
        through aduro.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const status = state[r.id] ?? r.status;
        const isNew = status === "requested" || status === "sent";
        return (
          <div
            key={r.id}
            className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${
              isNew ? "border-flame" : ""
            }`}
          >
            <div className="min-w-0">
              <div className="text-[15px] font-bold">
                {r.guest_name?.trim() || "A guest"} · {r.party_size}{" "}
                {r.party_size === 1 ? "person" : "people"}
              </div>
              <div className="text-[14px] text-mutedbrown">
                {longDate(r.reservation_date)} at {r.arrival_time}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[12.5px] font-bold ${
                  isNew ? "bg-flame text-blush" : "bg-sand text-cocoa"
                }`}
              >
                {STATUS_LABEL[status] ?? status}
              </span>
              {SETTABLE.map((s) => (
                <button
                  key={s.value}
                  disabled={busy === r.id || status === s.value}
                  onClick={() => void set(r.id, s.value)}
                  className="rounded-md border border-line px-2.5 py-1 text-[12.5px] font-semibold text-cocoa transition-colors hover:border-flame hover:text-flame disabled:opacity-40"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {toast && <Toast message={toast} />}
    </div>
  );
}
