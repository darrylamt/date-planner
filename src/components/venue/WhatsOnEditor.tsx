"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import { ImageField } from "@/components/admin/ImageField";
import { DAY_NAMES, describeSchedule } from "@/lib/schedules";
import { longDate } from "@/lib/format";
import type { EventRow, VenueSchedule } from "@/lib/types";

const CATEGORIES = [
  "live_music",
  "sip_and_paint",
  "festival",
  "run_club",
  "workshop",
  "film_night",
  "other",
];

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function clock(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The two different things a venue means by "what's on".
 *
 * A weekly fixture is a property of the place, like its opening hours: karaoke
 * every Thursday, a band every Friday. A dated event is a one-off: the block
 * party on the eighteenth.
 *
 * They are kept apart because the planner treats them differently and because
 * a venue confuses them constantly. Entering karaoke as fifty-two separate
 * events is the failure this screen exists to prevent, so the weekly one comes
 * first and the dated one says plainly that it is for a single date.
 */
export function WhatsOnEditor({
  venueId,
  areaId,
  schedules: initialSchedules,
  events: initialEvents,
}: {
  venueId: string;
  areaId: string;
  schedules: VenueSchedule[];
  events: EventRow[];
}) {
  const supabase = createClient();
  const [schedules, setSchedules] = useState(initialSchedules);
  const [events, setEvents] = useState(initialEvents);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  // Weekly
  const [wTitle, setWTitle] = useState("");
  const [wDay, setWDay] = useState(4); // Thursday, the canonical karaoke night
  const [wFrom, setWFrom] = useState("20:00");
  const [wTo, setWTo] = useState("23:00");
  const [wCover, setWCover] = useState("");

  // Dated
  const [eTitle, setETitle] = useState("");
  const [eDate, setEDate] = useState("");
  const [eTime, setETime] = useState("19:00");
  const [eCost, setECost] = useState("");
  const [eCategory, setECategory] = useState("live_music");
  const [eImage, setEImage] = useState("");

  async function addWeekly() {
    if (!wTitle.trim()) return say("Give it a name.");
    setBusy("weekly");
    const { data, error } = await supabase
      .from("venue_schedules")
      .insert({
        venue_id: venueId,
        weekday: wDay,
        starts_minute: minutes(wFrom),
        ends_minute: minutes(wTo),
        title: wTitle.trim(),
        // Blank is not free, it is "nobody said". Null keeps that distinction,
        // and only a real figure is ever added to somebody's budget.
        cover_ghs: wCover.trim() === "" ? null : Number(wCover),
      })
      .select("*")
      .single();
    setBusy(null);

    if (error || !data) return say(`Could not add that: ${error?.message ?? "unknown error"}`);
    setSchedules((s) => [...s, data as VenueSchedule]);
    setWTitle("");
    setWCover("");
    say("Added");
  }

  async function removeWeekly(id: string) {
    setBusy(id);
    const { error } = await supabase.from("venue_schedules").delete().eq("id", id);
    setBusy(null);
    if (error) return say(`Could not remove that: ${error.message}`);
    setSchedules((s) => s.filter((x) => x.id !== id));
  }

  async function addEvent() {
    if (!eTitle.trim() || !eDate) return say("An event needs a name and a date.");
    setBusy("event");
    const { data, error } = await supabase
      .from("events")
      .insert({
        title: eTitle.trim(),
        venue_id: venueId,
        area_id: areaId,
        event_date: eDate,
        start_time: eTime || null,
        cost_ghs: eCost.trim() === "" ? null : Number(eCost),
        category: eCategory,
        image_url: eImage.trim() || null,
      })
      .select("*")
      .single();
    setBusy(null);

    if (error || !data) return say(`Could not add that: ${error?.message ?? "unknown error"}`);
    setEvents((e) => [...e, data as EventRow]);
    setETitle("");
    setEDate("");
    setECost("");
    setEImage("");
    say("Added");
  }

  async function removeEvent(id: string) {
    setBusy(id);
    const { error } = await supabase.from("events").delete().eq("id", id);
    setBusy(null);
    if (error) return say(`Could not remove that: ${error.message}`);
    setEvents((e) => e.filter((x) => x.id !== id));
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => e.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  return (
    <div className="flex flex-col gap-6">
      {/* ── Every week ── */}
      <section className="card p-5">
        <h2 className="font-display text-[18px] font-bold">Every week</h2>
        <p className="mb-4 mt-1 text-[14px] text-mutedbrown">
          Something you do on the same day every week. We only mention it to somebody whose evening
          actually overlaps it, so karaoke at nine is never promised to a table booked for six.
        </p>

        {schedules.length > 0 ? (
          <div className="mb-4 divide-y divide-line">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[14.5px]">{describeSchedule(s)}</span>
                <button
                  onClick={() => void removeWeekly(s.id)}
                  disabled={busy === s.id}
                  className="rounded-md border border-line px-2 py-1 text-[12px] text-mutedbrown transition-colors hover:border-flame hover:text-flame disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-[1fr_140px_110px_110px_130px_auto] md:items-end">
          <label className="flex flex-col">
            <span className="flbl">What</span>
            <input
              className="inp"
              value={wTitle}
              placeholder="Karaoke"
              onChange={(e) => setWTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Day</span>
            <select
              className="inp"
              value={wDay}
              onChange={(e) => setWDay(Number(e.target.value))}
            >
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}s
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            <span className="flbl">From</span>
            <input
              type="time"
              className="inp"
              value={wFrom}
              onChange={(e) => setWFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">To</span>
            <input
              type="time"
              className="inp"
              value={wTo}
              onChange={(e) => setWTo(e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Cover, GHS</span>
            <input
              type="number"
              min={0}
              className="inp font-mono"
              value={wCover}
              placeholder="none"
              onChange={(e) => setWCover(e.target.value)}
            />
          </label>
          <button
            className="btn btnsm px-5"
            onClick={() => void addWeekly()}
            disabled={busy === "weekly"}
          >
            Add
          </button>
        </div>
        <p className="mt-2 text-[12.5px] text-mutedbrown">
          Finishing after midnight is fine, put the later time in &ldquo;to&rdquo; and we will read
          it as the next morning. A cover you enter is added to people&apos;s budgets, so they are
          not surprised at the door.
        </p>
      </section>

      {/* ── One-off ── */}
      <section className="card p-5">
        <h2 className="font-display text-[18px] font-bold">On one date</h2>
        <p className="mb-4 mt-1 text-[14px] text-mutedbrown">
          A single night: a block party, a guest DJ, a launch. If it happens every week, use the
          box above instead rather than entering it fifty-two times.
        </p>

        {upcoming.length > 0 ? (
          <div className="mb-4 divide-y divide-line">
            {upcoming.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[14.5px]">
                  <b>{e.title}</b>
                  <span className="text-mutedbrown">
                    {" "}
                    · {longDate(e.event_date)}
                    {e.start_time ? ` at ${e.start_time.slice(0, 5)}` : ""}
                    {e.cost_ghs ? ` · GHS ${Math.round(Number(e.cost_ghs))} in` : ""}
                  </span>
                </span>
                <button
                  onClick={() => void removeEvent(e.id)}
                  disabled={busy === e.id}
                  className="rounded-md border border-line px-2 py-1 text-[12px] text-mutedbrown transition-colors hover:border-flame hover:text-flame disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-[1fr_150px_110px_120px_150px] md:items-end">
          <label className="flex flex-col">
            <span className="flbl">What</span>
            <input
              className="inp"
              value={eTitle}
              placeholder="Block Party"
              onChange={(e) => setETitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Date</span>
            <input
              type="date"
              className="inp"
              value={eDate}
              min={today}
              onChange={(e) => setEDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Starts</span>
            <input
              type="time"
              className="inp"
              value={eTime}
              onChange={(e) => setETime(e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Entry, GHS</span>
            <input
              type="number"
              min={0}
              className="inp font-mono"
              value={eCost}
              placeholder="free"
              onChange={(e) => setECost(e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Kind</span>
            <select
              className="inp"
              value={eCategory}
              onChange={(e) => setECategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          {/* The poster is the whole reason an event stop looks different from
              an ordinary one: it leads the pictures, ahead of the venue's. */}
          <ImageField
            label="Poster"
            value={eImage}
            onChange={setEImage}
            folder="events"
            hint="Shown first, ahead of your usual pictures"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button className="btn btnsm px-7" onClick={() => void addEvent()} disabled={busy === "event"}>
            {busy === "event" ? "Adding…" : "Add event"}
          </button>
        </div>
      </section>

      {toast && <Toast message={toast} />}
    </div>
  );
}
