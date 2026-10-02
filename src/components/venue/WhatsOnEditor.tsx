"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import { ImageField } from "@/components/admin/ImageField";
import { DAY_NAMES, describeSchedule } from "@/lib/schedules";
import { longDate } from "@/lib/format";
import type { Audience, EventRow, VenueSchedule } from "@/lib/types";

/** A venue a planner can hold a night at: one of their own, or any on Duro. */
export interface EventPlace {
  id: string;
  name: string;
  area_id: string;
  area: string;
  /** One of their own locations, listed first. */
  mine: boolean;
}

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
  organiser = null,
  places = null,
  usualPlace = null,
}: {
  /** The venue whose weekly nights these are. Empty for a planner with no place of their own. */
  venueId: string;
  areaId: string;
  schedules: VenueSchedule[];
  events: EventRow[];
  /** A planner's name and logo, stamped on each event they add (0071). */
  organiser?: { name: string; logoUrl: string | null } | null;
  /**
   * Set for a planner (0072): every venue a night of theirs can be at, so
   * each event says where it is rather than all being at one location.
   */
  places?: EventPlace[] | null;
  /** Where this planner usually holds their nights, to start the Where box on. */
  usualPlace?: string | null;
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
  const [wWho, setWWho] = useState<Audience>("everyone");

  // Dated
  const [eTitle, setETitle] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eDate, setEDate] = useState("");
  const [eTime, setETime] = useState("19:00");
  const [eCost, setECost] = useState("");
  const [eCategory, setECategory] = useState("live_music");
  const [eImage, setEImage] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eWho, setEWho] = useState<Audience>("everyone");
  /*
   * Where a planner's night is. Most hold theirs at one place most of the
   * time, so it starts on the venue they use most, then their current place,
   * then their own first one, and stays on whatever they pick while they add
   * several nights in a row.
   */
  const [eWhere, setEWhere] = useState(
    places ? (usualPlace && places.some((x) => x.id === usualPlace) ? usualPlace : venueId || places.find((x) => x.mine)?.id || "") : venueId
  );
  const [whereSearch, setWhereSearch] = useState("");

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
        // Only when it is not everyone: before migration 0067 the column does not exist.
        ...(wWho !== "everyone" ? { audience: wWho } : {}),
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
    const where = places ? places.find((x) => x.id === eWhere) : null;
    if (places && !where) return say("Choose where it is happening.");
    setBusy("event");
    const { data, error } = await supabase
      .from("events")
      .insert({
        title: eTitle.trim(),
        // Only when written: before migration 0058 the column does not exist.
        ...(eDesc.trim() ? { description: eDesc.trim() } : {}),
        ...(eWho !== "everyone" ? { audience: eWho } : {}),
        // A planner's night is wherever they said; a venue's is at the venue.
        venue_id: where ? where.id : venueId,
        area_id: where ? where.area_id : areaId,
        event_date: eDate,
        start_time: eTime || null,
        cost_ghs: eCost.trim() === "" ? null : Number(eCost),
        category: eCategory,
        image_url: eImage.trim() || null,
        /*
         * Straight in, with no approval step.
         *
         * Every other number in this database queues behind an admin,
         * because every other number was read off somebody else's Instagram
         * and might belong to somebody else entirely. This one is the
         * organiser's own, about their own event. There is nothing to
         * verify, and for a one-night event a queue means the poster goes up
         * with no way to reach anybody about it.
         */
        contact_phone: ePhone.trim() || null,
        /*
         * Who is running it, for the card in a plan. Only once they have a
         * logo: that needs migration 0071, and naming its columns before it
         * has run would fail the whole insert.
         */
        ...(organiser?.logoUrl ? { organiser_name: organiser.name, organiser_logo_url: organiser.logoUrl } : {}),
      })
      .select("*")
      .single();
    setBusy(null);

    if (error || !data) return say(`Could not add that: ${error?.message ?? "unknown error"}`);
    setEvents((e) => [...e, data as EventRow]);
    setETitle("");
    setEDesc("");
    setEDate("");
    setECost("");
    setEImage("");
    setEPhone("");
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

  const placeName = new Map((places ?? []).map((x) => [x.id, x.name]));
  const needle = whereSearch.trim().toLowerCase();
  const shown = (places ?? []).filter(
    (x) => x.id === eWhere || !needle || x.name.toLowerCase().includes(needle) || x.area.toLowerCase().includes(needle)
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ── Every week ── A property of a place, so only where there is one of theirs. */}
      {venueId ? (
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

        <div className="grid gap-3 md:grid-cols-[1fr_140px_110px_110px_130px_150px_auto] md:items-end">
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
          <label className="flex flex-col">
            <span className="flbl">Who can come</span>
            <select className="inp" value={wWho} onChange={(e) => setWWho(e.target.value as Audience)}>
              <option value="everyone">Everyone</option>
              <option value="women">Ladies only</option>
              <option value="men">Men only</option>
            </select>
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
      ) : null}

      {/* ── One-off ── */}
      <section className="card p-5">
        <h2 id="add-event" className="scroll-mt-6 font-display text-[18px] font-bold">On one date</h2>
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
                    {places && e.venue_id ? ` · at ${placeName.get(e.venue_id) ?? "a venue"}` : ""}
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

        {places ? (
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr] md:items-end">
            <label className="flex flex-col">
              <span className="flbl">Where is it happening</span>
              <select className="inp" value={eWhere} onChange={(e) => setEWhere(e.target.value)}>
                <option value="">Choose a venue</option>
                {shown.some((x) => x.mine) ? (
                  <optgroup label="Your places">
                    {shown.filter((x) => x.mine).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} — {x.area}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Venues on Duro">
                  {shown.filter((x) => !x.mine).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} — {x.area}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="flex flex-col">
              <span className="flbl">Find a venue</span>
              <input
                className="inp"
                value={whereSearch}
                placeholder="Type a name or part of town"
                onChange={(e) => setWhereSearch(e.target.value)}
              />
            </label>
            <p className="text-[12.5px] text-mutedbrown md:col-span-2">
              Each night can be somewhere different. Not in the list?{" "}
              <a href="/venue/locations" className="font-semibold text-flame underline">
                Add the place
              </a>{" "}
              and it will be here.
            </p>
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
              placeholder="0 if free"
              onChange={(e) => setECost(e.target.value)}
            />
            {/*
              The placeholder used to say "free", and it was wrong in the way
              that costs you the booking. Blank writes null, and null means
              nobody knows -- matching.ts only treats an event as priced when
              the figure is a real number, so a place with no menu and a blank
              entry price is withheld from every evening it could have been
              in. A free event has to say 0 to be free.
            */}
            <span className="mt-1.5 text-[12px] text-mutedbrown">
              Type 0 for free. Left blank we do not know the price, and we
              leave you out of plans with a budget rather than guess.
            </span>
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
          <label className="flex flex-col">
            <span className="flbl">Who can come</span>
            <select className="inp" value={eWho} onChange={(e) => setEWho(e.target.value as Audience)}>
              <option value="everyone">Everyone</option>
              <option value="women">Ladies only</option>
              <option value="men">Men only</option>
            </select>
            <span className="mt-1.5 text-[12px] text-mutedbrown">
              Only if nobody else can come. Free entry for ladies is still Everyone.
            </span>
          </label>
        </div>

        <label className="mt-4 flex flex-col">
          <span className="flbl">What to expect</span>
          <textarea
            className="inp min-h-[72px] py-2"
            maxLength={400}
            value={eDesc}
            placeholder="Who is playing, what the night is like, what to wear"
            onChange={(e) => setEDesc(e.target.value)}
          />
          <span className="mt-1.5 text-[12px] text-mutedbrown">
            Shown under the event&apos;s name on the plan.
          </span>
        </label>

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_280px] md:items-start">
          {/* The poster is the whole reason an event stop looks different from
              an ordinary one: it leads the pictures, ahead of the venue's. */}
          <ImageField
            label="Poster"
            value={eImage}
            onChange={setEImage}
            folder="events"
            hint="Shown first, ahead of your usual pictures"
          />
          <label className="flex flex-col">
            <span className="flbl">Who to call about it</span>
            <input
              className="inp font-mono"
              value={ePhone}
              placeholder="+233 ..."
              inputMode="tel"
              onChange={(e) => setEPhone(e.target.value)}
            />
            {/* Said plainly, because every other number in this portal
                behaves differently and a venue has no way to know why. */}
            <span className="mt-1.5 text-[12px] text-mutedbrown">
              Goes live straight away. It is shown on this event only, and
              does not change the number on your listing.
            </span>
          </label>
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
