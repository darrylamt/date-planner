"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ReservationRequest, ReservationStatus } from "@/lib/types";
import { ADMIN_PAGE_SIZE, Pager, SearchBox, usePagedRows } from "./TableControls";

const STATUSES: ReservationStatus[] = ["requested", "sent", "confirmed", "declined", "cancelled"];

function statusBadge(status: ReservationStatus): string {
  if (status === "confirmed") return "badge b-ok";
  if (status === "declined" || status === "cancelled") return "badge b-stale";
  return "badge bg-sand text-cocoa";
}

/** Reservation requests inbox, the seed of the venue-facing portal. */
export function ReservationsManager({ reservations }: { reservations: ReservationRequest[] }) {
  const [rows, setRows] = useState(reservations);
  const [savingId, setSavingId] = useState<string | null>(null);

  /*
   * Status is searchable text rather than a separate filter control, so
   * "requested" finds the ones still needing a call. An inbox only grows, and
   * this is the table most likely to be read on a phone.
   */
  const paged = usePagedRows(
    rows,
    (r, needle) =>
      r.venue_name.toLowerCase().includes(needle) ||
      (r.guest_name ?? "").toLowerCase().includes(needle) ||
      r.status.includes(needle) ||
      r.reservation_date.includes(needle)
  );

  async function setStatus(id: string, status: ReservationStatus) {
    setSavingId(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("reservation_requests")
      .update({ status })
      .eq("id", id);
    if (!error) {
      setRows((cur) => cur.map((r) => (r.id === id ? { ...r, status } : r)));
    }
    setSavingId(null);
  }

  return (
    <div>
      <h1 className="font-display text-[26px] font-bold">Reservations</h1>
      <p className="mt-1 text-[14.5px] text-mutedbrown">
        Requests made on users&apos; behalf. Delivery is WhatsApp for now, update the status here
        as venues confirm.
      </p>

      {rows.length === 0 ? (
        <div className="card mt-6 px-6 py-8 text-center text-[15px] text-mutedbrown">
          No reservation requests yet, they&apos;ll appear here as users accept plans.
        </div>
      ) : (
        <div className="card mt-6">
          {rows.length > ADMIN_PAGE_SIZE ? (
            <div className="mb-4">
              <SearchBox
                value={paged.query}
                onChange={paged.setQuery}
                placeholder="Search venue, guest or status"
              />
            </div>
          ) : null}

          <div className="overflow-x-auto">
          <table className="tbl w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th>Requested</th>
                <th>Venue</th>
                <th>Date · time</th>
                <th>Party</th>
                <th>Guest</th>
                <th>Plan</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td className="font-semibold">{r.venue_name}</td>
                  <td className="whitespace-nowrap">
                    {new Date(`${r.reservation_date}T12:00:00`).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    · {r.arrival_time}
                  </td>
                  <td>{r.party_size}</td>
                  <td>{r.guest_name ?? "not given"}</td>
                  <td className="text-mutedbrown">
                    {r.plan_slug ? <code className="text-[12px]">{r.plan_slug}</code> : "direct"}
                  </td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className={statusBadge(r.status)}>{r.status}</span>
                      <select
                        className="rounded-md border border-line bg-shell px-1.5 py-1 text-[13px] text-ink focus:border-flame focus:outline-none"
                        value={r.status}
                        disabled={savingId === r.id}
                        onChange={(e) => setStatus(r.id, e.target.value as ReservationStatus)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </span>
                  </td>
                </tr>
              ))}
              {paged.total === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-mutedbrown">
                    No request matches “{paged.query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          <Pager
            page={paged.page}
            pageCount={paged.pageCount}
            start={paged.start}
            count={paged.pageRows.length}
            total={paged.total}
            unit="requests"
            onGoTo={paged.goTo}
          />
        </div>
      )}
    </div>
  );
}
