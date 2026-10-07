"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { IconCheck, IconClose } from "@/components/planner/icons";
import type { ReservationRequest, ReservationStatus } from "@/lib/types";
import { useToast } from "./ui";

const LABEL: Record<string, string> = {
  requested: "New",
  sent: "New",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
};

function when(r: ReservationRequest) {
  const d = new Date(`${r.reservation_date}T12:00:00`);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const [h, m] = String(r.arrival_time ?? "").split(":").map(Number);
  const time = Number.isFinite(h) ? `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "pm" : "am"}` : "";
  return { day, time };
}

/**
 * Who asked for a table. New ones first, as big cards with the two answers
 * a manager actually gives; the rest as a short list underneath.
 *
 * Marking one sends nothing to the guest, and the screen says so: the
 * request reached the venue on WhatsApp or by phone, and the conversation
 * lives there. This is the venue's own record.
 */
export function Bookings({ rows }: { rows: ReservationRequest[] }) {
  const [status, setStatus] = useState<Record<string, ReservationStatus>>(() => Object.fromEntries(rows.map((r) => [r.id, r.status])));
  const [leaving, setLeaving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { say, toast } = useToast();

  async function answer(r: ReservationRequest, next: ReservationStatus) {
    const before = status[r.id];
    setLeaving(r.id);
    // Let the card slide out before it moves to the list below.
    await new Promise((res) => setTimeout(res, 300));
    setStatus((s) => ({ ...s, [r.id]: next }));
    setLeaving(null);
    const { error } = await createClient().from("reservation_requests").update({ status: next }).eq("id", r.id);
    if (error) {
      setStatus((s) => ({ ...s, [r.id]: before }));
      return say("That did not save. Try again.", false);
    }
    say(next === "confirmed" ? "Marked confirmed" : "Marked as can't do it");
  }

  const today = new Date().toISOString().slice(0, 10);
  const isNew = (r: ReservationRequest) => status[r.id] === "requested" || status[r.id] === "sent";
  const waiting = rows.filter((r) => isNew(r) && r.reservation_date >= today).sort((a, b) => a.reservation_date.localeCompare(b.reservation_date));
  const rest = rows.filter((r) => !waiting.includes(r));
  const shown = showAll ? rest : rest.slice(0, 5);

  return (
    <div>
      {waiting.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {waiting.map((r, n) => {
            const w = when(r);
            return (
              <article
                key={r.id}
                className={`pl-card relative overflow-hidden p-5 ${leaving === r.id ? "pl-leave" : "pl-up"}`}
                style={{ animationDelay: leaving === r.id ? "0ms" : `${n * 70}ms` }}
              >
                <span className="absolute inset-y-0 left-0 w-1.5 bg-[var(--p-accent)]" />
                <div className="flex items-center justify-between gap-3">
                  <span className="pl-pulse rounded-full bg-[var(--p-accent)] px-2.5 py-0.5 text-[12px] font-bold text-white">New</span>
                  <span className="text-[14px] font-semibold text-[var(--p-muted)]">
                    {w.day} · {w.time}
                  </span>
                </div>
                <div className="mt-2 text-[19px] font-bold">
                  {r.guest_name?.trim() || "A guest"} · table for {r.party_size}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" className="pl-btn !min-h-[46px] whitespace-nowrap !bg-[var(--p-ok)] !px-2.5 !text-[15px] !shadow-none" onClick={() => void answer(r, "confirmed")}>
                    <IconCheck size={18} /> Confirmed
                  </button>
                  <button type="button" className="pl-btn-ghost !min-h-[46px] whitespace-nowrap !px-2.5 !text-[15px]" onClick={() => void answer(r, "declined")}>
                    <IconClose size={16} /> Can&apos;t do it
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="pl-card pl-up flex items-center gap-4 p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascots/scene_table.png" alt="" className="h-16 w-16 shrink-0 [image-rendering:pixelated]" />
          <div>
            <div className="text-[16px] font-bold">No new bookings</div>
            <p className="text-[14px] leading-snug text-[var(--p-muted)]">They appear here the moment somebody asks for a table through Duro.</p>
          </div>
        </div>
      )}

      {waiting.length ? (
        <p className="mt-3 text-[13px] text-[var(--p-muted)]">
          Tapping an answer is for your own record. It doesn&apos;t message the guest; reply to them on WhatsApp or by phone as usual.
        </p>
      ) : null}

      {rest.length ? (
        <div className="mt-5">
          <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--p-muted)]">Earlier</h3>
          <div className="pl-card divide-y divide-[var(--p-line)]">
            {shown.map((r) => {
              const w = when(r);
              const s = status[r.id];
              return (
                <div key={r.id} className="pl-fade flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold">
                      {r.guest_name?.trim() || "A guest"} · {r.party_size}
                    </div>
                    <div className="text-[13px] text-[var(--p-muted)]">
                      {w.day} · {w.time}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${
                      s === "confirmed"
                        ? "bg-[var(--p-ok-soft)] text-[var(--p-ok)]"
                        : s === "requested" || s === "sent"
                          ? "bg-[var(--p-accent-soft)] text-[var(--p-accent-dark)]"
                          : "bg-[var(--p-sunken)] text-[var(--p-muted)]"
                    }`}
                  >
                    {LABEL[s] ?? s}
                  </span>
                </div>
              );
            })}
          </div>
          {rest.length > 5 ? (
            <button type="button" className="mt-2 text-[14px] font-bold text-[var(--p-accent)]" onClick={() => setShowAll((x) => !x)}>
              {showAll ? "Show fewer" : `Show all ${rest.length}`}
            </button>
          ) : null}
        </div>
      ) : null}
      {toast}
    </div>
  );
}
