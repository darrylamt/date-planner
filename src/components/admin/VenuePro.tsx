"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ProRow {
  venue_id: string;
  name: string;
  area: string;
  until: string | null;
}

const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/**
 * Portal Pro, by hand: which venues see the full "How people respond" on
 * their Insights (venue_response, 0094), and until when.
 */
export function VenuePro({ rows }: { rows: ProRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  const today = new Date().toISOString().slice(0, 10);

  async function save(venueId: string, until: string | null) {
    setBusy(venueId);
    const res = await fetch("/api/admin/venue-pro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venueId, until }),
    });
    setBusy(null);
    if (res.ok) router.refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="text-[18px] font-bold">Portal Pro</h2>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        Pro venues see how people respond to them on their Insights: kept against the area, menu opens, Book taps,
        page visits, and the dishes people add and take off. Every venue sees shown, kept and swapped out.
      </p>
      {rows.length === 0 ? (
        <div className="why mt-3">No venue has a portal login yet. Give one a login above first.</div>
      ) : (
        <div className="card mt-3 overflow-x-auto p-0">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Venue</th>
                <th>Pro</th>
                <th>Until</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = r.until != null && r.until >= today;
                const picked = dates[r.venue_id] ?? r.until ?? inDays(30);
                return (
                  <tr key={r.venue_id}>
                    <td>
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-[12px] text-mutedbrown">{r.area}</div>
                    </td>
                    <td>
                      {on ? <span className="badge b-ok">On</span> : r.until ? <span className="badge b-stale">Ended</span> : <span className="text-mutedbrown">Off</span>}
                    </td>
                    <td>
                      <input
                        type="date"
                        className="inp !h-[34px] !w-[150px]"
                        value={picked}
                        min={today}
                        onChange={(e) => setDates((d) => ({ ...d, [r.venue_id]: e.target.value }))}
                      />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button type="button" className="btn btnsm" disabled={busy === r.venue_id} onClick={() => save(r.venue_id, picked)}>
                        {on ? "Change date" : "Turn on"}
                      </button>
                      {r.until ? (
                        <button
                          type="button"
                          className="btn2 btnsm ml-2 !text-staletext"
                          disabled={busy === r.venue_id}
                          onClick={() => save(r.venue_id, null)}
                        >
                          Turn off
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
