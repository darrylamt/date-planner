"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import { longDate } from "@/lib/format";

export interface FeaturedRow {
  id: string;
  venue_id: string;
  venue_name: string;
  area: string;
  starts_on: string;
  ends_on: string;
  headline: string | null;
  is_paid: boolean;
  sort: number;
}

/** Monday of the week containing `d`, which is what "this week" means here. */
function weekStart(d = new Date()): string {
  const copy = new Date(d);
  const day = copy.getDay();
  // getDay is 0 for Sunday, so Sunday goes back six days rather than forward.
  copy.setDate(copy.getDate() - ((day + 6) % 7));
  return copy.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Who is on the home screen, and until when.
 *
 * The only place in the product where a venue's position is bought rather than
 * earned, which is why it is a separate table, a separate screen and a visible
 * label rather than a flag on the venue. The planner never reads any of it.
 */
export function FeaturedManager({
  rows,
  venues,
}: {
  rows: FeaturedRow[];
  venues: { id: string; name: string; area: string }[];
}) {
  const supabase = createClient();
  const [runs, setRuns] = useState(rows);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const monday = weekStart();
  const [venueId, setVenueId] = useState("");
  const [startsOn, setStartsOn] = useState(monday);
  const [endsOn, setEndsOn] = useState(addDays(monday, 6));
  const [headline, setHeadline] = useState("");
  const [isPaid, setIsPaid] = useState(false);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  const today = new Date().toISOString().slice(0, 10);
  const live = runs.filter((r) => r.starts_on <= today && r.ends_on >= today);

  async function add() {
    if (!venueId) return say("Pick a venue.");
    if (endsOn < startsOn) return say("The end date is before the start.");

    setBusy(true);
    const { data, error } = await supabase
      .from("featured_venues")
      .insert({
        venue_id: venueId,
        starts_on: startsOn,
        ends_on: endsOn,
        headline: headline.trim() || null,
        is_paid: isPaid,
        sort: runs.length,
      })
      .select("*")
      .single();
    setBusy(false);

    if (error || !data) return say(`Could not add that: ${error?.message ?? "unknown error"}`);

    const venue = venues.find((v) => v.id === venueId)!;
    setRuns((r) => [
      {
        id: data.id as string,
        venue_id: venueId,
        venue_name: venue.name,
        area: venue.area,
        starts_on: startsOn,
        ends_on: endsOn,
        headline: headline.trim() || null,
        is_paid: isPaid,
        sort: r.length,
      },
      ...r,
    ]);
    setVenueId("");
    setHeadline("");
    setIsPaid(false);
    say("Added");
  }

  async function remove(row: FeaturedRow) {
    if (!confirm(`Take ${row.venue_name} off the featured shelf?`)) return;
    setBusy(true);
    const { error } = await supabase.from("featured_venues").delete().eq("id", row.id);
    setBusy(false);
    if (error) return say(`Could not remove that: ${error.message}`);
    setRuns((r) => r.filter((x) => x.id !== row.id));
  }

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Featured this week</h1>
      <p className="mt-1 max-w-[62ch] text-[14px] text-mutedbrown">
        A shelf on the home screen, above the occasions. Deliberately the only place a venue&apos;s
        position can be bought: the planner chooses stops on fit alone, and a paid slot inside an
        itinerary would make every itinerary unreadable. Anything marked paid shows the reader
        &ldquo;Promoted&rdquo;, and that cannot be turned off.
      </p>

      {/* ── Add a run ── */}
      <div className="card mt-5 grid gap-3 p-5 md:grid-cols-[1fr_150px_150px_auto] md:items-end">
        <label className="flex flex-col">
          <span className="flbl">Venue</span>
          <select className="inp" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            <option value="">Choose one</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.area}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="flbl">From</span>
          <input
            type="date"
            className="inp"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
        </label>
        <label className="flex flex-col">
          <span className="flbl">Until</span>
          <input
            type="date"
            className="inp"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </label>
        <button className="btn btnsm px-6" onClick={() => void add()} disabled={busy}>
          {busy ? "Working…" : "Feature it"}
        </button>

        <label className="flex flex-col md:col-span-3">
          <span className="flbl">Why this one, in one line</span>
          <input
            className="inp"
            maxLength={120}
            value={headline}
            placeholder="Live band every Friday. Blank uses the venue's own description."
            onChange={(e) => setHeadline(e.target.value)}
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-[14px] font-semibold">
          <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
          They paid
        </label>
      </div>

      {/* ── Live now ── */}
      <h2 className="mt-8 font-display text-[18px] font-bold">
        On the home screen now{live.length ? ` (${live.length})` : ""}
      </h2>
      {live.length === 0 ? (
        <p className="mt-2 rounded-bar border border-line bg-cream/60 p-4 text-[14px] text-mutedbrown">
          Nothing is featured today, so the shelf is hidden in the app rather than showing an empty
          heading.
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {runs.map((row) => {
          const isLive = row.starts_on <= today && row.ends_on >= today;
          const isOver = row.ends_on < today;
          return (
            <div
              key={row.id}
              className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${
                isLive ? "border-flame" : ""
              } ${isOver ? "opacity-60" : ""}`}
            >
              <div className="min-w-0">
                <div className="text-[15px] font-bold">
                  {row.venue_name}
                  {row.is_paid ? (
                    <span className="ml-2 rounded-full bg-sand px-2 py-0.5 text-[11.5px] font-bold uppercase text-cocoa">
                      Promoted
                    </span>
                  ) : null}
                </div>
                <div className="text-[13px] text-mutedbrown">
                  {longDate(row.starts_on)} to {longDate(row.ends_on)}
                  {isOver ? " · finished" : isLive ? " · live" : " · upcoming"}
                </div>
                {row.headline ? (
                  <div className="mt-0.5 text-[13px] italic text-cocoa">{row.headline}</div>
                ) : null}
              </div>
              <button
                onClick={() => void remove(row)}
                disabled={busy}
                className="rounded-md border border-line px-2.5 py-1 text-[12.5px] font-semibold text-mutedbrown transition-colors hover:border-flame hover:text-flame disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
