"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/planner/Sheet";
import { PosterUpload } from "@/components/planner/PosterUpload";
import { IconCalendar, IconCopy, IconPlus } from "@/components/planner/icons";
import { VENUE_VIBE_TAGS } from "@/lib/catalog";
import type { Audience, EventRow, VenueSchedule } from "@/lib/types";
import { useToast } from "./ui";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];

const KINDS: { id: string; label: string; emoji: string }[] = [
  { id: "live_music", label: "Live music", emoji: "🎷" },
  { id: "party", label: "Party or DJ", emoji: "🪩" },
  { id: "karaoke", label: "Karaoke", emoji: "🎤" },
  { id: "comedy", label: "Comedy", emoji: "😂" },
  { id: "sip_and_paint", label: "Sip and paint", emoji: "🎨" },
  { id: "brunch_party", label: "Brunch party", emoji: "🥂" },
  { id: "festival", label: "Festival", emoji: "🎪" },
  { id: "workshop", label: "Workshop or class", emoji: "🧑‍🍳" },
  { id: "film_night", label: "Film night", emoji: "🎬" },
  { id: "run_club", label: "Run club", emoji: "🏃🏾" },
];
const kindOf = (id: string) => KINDS.find((k) => k.id === id);
const vibeLabel = (v: string) => v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const AUDIENCES: { v: Audience; l: string }[] = [
  { v: "everyone", l: "Everyone" },
  { v: "women", l: "Ladies only" },
  { v: "men", l: "Men only" },
];

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const toClock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const pretty = (hhmm: string | null) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "pm" : "am"}`;
};

interface WeeklyDraft {
  id: string | null;
  title: string;
  day: number;
  from: string;
  to: string;
  free: boolean;
  cover: string;
  audience: Audience;
}

interface EventDraft {
  id: string | null;
  title: string;
  kind: string;
  customKind: string;
  date: string;
  time: string;
  free: boolean;
  cost: string;
  image: string;
  description: string;
  vibes: string[];
  phone: string;
  audience: Audience;
}

const newWeekly = (): WeeklyDraft => ({ id: null, title: "", day: 5, from: "20:00", to: "23:00", free: true, cover: "", audience: "everyone" });
const newEvent = (): EventDraft => ({
  id: null,
  title: "",
  kind: "live_music",
  customKind: "",
  date: "",
  time: "19:00",
  free: true,
  cost: "",
  image: "",
  description: "",
  vibes: [],
  phone: "",
  audience: "everyone",
});

/**
 * What's on: the nights you do every week, and the one-off events.
 *
 * Kept apart because the planner treats them differently and because the
 * commonest mistake is entering karaoke as fifty-two separate events. So the
 * two are two buttons, each saying plainly which it is.
 */
export function NightsManager({
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
  const [weekly, setWeekly] = useState<WeeklyDraft | null>(null);
  const [event, setEvent] = useState<EventDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const { say, toast } = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const past = events.filter((e) => e.event_date < today).sort((a, b) => b.event_date.localeCompare(a.event_date));
  const weeklySorted = [...schedules].sort((a, b) => WEEK.indexOf(a.weekday) - WEEK.indexOf(b.weekday) || a.starts_minute - b.starts_minute);

  // ── Weekly ──
  function editWeekly(s: VenueSchedule) {
    setError(null);
    setWeekly({
      id: s.id,
      title: s.title,
      day: s.weekday,
      from: toClock(s.starts_minute),
      to: toClock(s.ends_minute),
      free: !(Number(s.cover_ghs) > 0),
      cover: Number(s.cover_ghs) > 0 ? String(Number(s.cover_ghs)) : "",
      audience: s.audience ?? "everyone",
    });
  }

  async function saveWeekly() {
    if (!weekly) return;
    if (!weekly.title.trim()) return setError("Give it a name, like Karaoke Thursdays.");
    if (!weekly.free && !(Number(weekly.cover) > 0)) return setError("Type the entry fee, or choose Free.");
    setBusy(true);
    setError(null);
    const fields: Record<string, unknown> = {
      title: weekly.title.trim(),
      weekday: weekly.day,
      starts_minute: toMinutes(weekly.from),
      ends_minute: toMinutes(weekly.to),
      cover_ghs: weekly.free ? 0 : Number(weekly.cover),
      audience: weekly.audience,
    };
    const q = weekly.id
      ? supabase.from("venue_schedules").update(fields).eq("id", weekly.id).select("*").single()
      : supabase.from("venue_schedules").insert({ ...fields, venue_id: venueId }).select("*").single();
    const { data, error: err } = await q;
    setBusy(false);
    if (err || !data) return setError("That did not save. Try again.");
    const row = data as VenueSchedule;
    setSchedules((s) => (weekly.id ? s.map((x) => (x.id === row.id ? row : x)) : [...s, row]));
    setWeekly(null);
    say(weekly.id ? "Saved" : `${row.title} is on, every ${DAY_LONG[row.weekday]}`);
  }

  async function removeWeekly() {
    if (!weekly?.id || !confirm(`Stop "${weekly.title}"? It comes out of plans straight away.`)) return;
    setBusy(true);
    const { error: err } = await supabase.from("venue_schedules").delete().eq("id", weekly.id);
    setBusy(false);
    if (err) return setError("That did not remove. Try again.");
    setSchedules((s) => s.filter((x) => x.id !== weekly.id));
    setWeekly(null);
    say("Removed");
  }

  // ── Dated ──
  function editEvent(e: EventRow, again = false) {
    setError(null);
    const known = kindOf(e.category);
    setEvent({
      id: again ? null : e.id,
      title: e.title,
      kind: known ? e.category : "custom",
      customKind: known ? "" : vibeLabel(e.category),
      date: again ? "" : e.event_date,
      time: e.start_time?.slice(0, 5) ?? "19:00",
      free: !(Number(e.cost_ghs) > 0),
      cost: Number(e.cost_ghs) > 0 ? String(Number(e.cost_ghs)) : "",
      image: e.image_url ?? "",
      description: e.description ?? "",
      vibes: e.vibe_tags ?? [],
      phone: e.contact_phone ?? "",
      audience: e.audience ?? "everyone",
    });
  }

  async function saveEvent() {
    if (!event) return;
    if (!event.title.trim()) return setError("Give it a name.");
    if (!event.date) return setError("Pick the date.");
    if (event.kind === "custom" && !event.customKind.trim()) return setError("Say what kind of event it is.");
    if (!event.free && !(Number(event.cost) > 0)) return setError("Type the price, or choose Free.");
    const category =
      event.kind === "custom"
        ? event.customKind.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "other"
        : event.kind;
    setBusy(true);
    setError(null);
    const fields: Record<string, unknown> = {
      title: event.title.trim(),
      description: event.description.trim() || null,
      event_date: event.date,
      start_time: event.time || null,
      cost_ghs: event.free ? 0 : Number(event.cost),
      category,
      vibe_tags: event.vibes,
      image_url: event.image.trim() || null,
      contact_phone: event.phone.trim() || null,
      audience: event.audience,
    };
    const q = event.id
      ? supabase.from("events").update(fields).eq("id", event.id).select("*").single()
      : supabase.from("events").insert({ ...fields, venue_id: venueId, area_id: areaId }).select("*").single();
    const { data, error: err } = await q;
    setBusy(false);
    if (err || !data) return setError("That did not save. Try again.");
    const row = data as EventRow;
    setEvents((list) => (event.id ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row]));
    setEvent(null);
    say(event.id ? "Saved" : "It's on. People can see it in their plans.");
  }

  async function removeEvent() {
    if (!event?.id || !confirm(`Take "${event.title}" down? It comes out of plans straight away.`)) return;
    setBusy(true);
    const { error: err } = await supabase.from("events").delete().eq("id", event.id);
    setBusy(false);
    if (err) return setError("That did not remove. Try again.");
    setEvents((list) => list.filter((x) => x.id !== event.id));
    setEvent(null);
    say("Taken down");
  }

  const errorLine = error ? (
    <p role="alert" className="pl-fade text-[14px] font-semibold text-[var(--p-accent-dark)]">
      {error}
    </p>
  ) : null;

  const price = (free: boolean, amount: string, onFree: (f: boolean) => void, onAmount: (a: string) => void, word: string) => (
    <div>
      <span className="pl-label">{word}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="pl-chip" aria-pressed={free} onClick={() => onFree(true)}>
          Free
        </button>
        <button type="button" className="pl-chip" aria-pressed={!free} onClick={() => onFree(false)}>
          There&apos;s a fee
        </button>
        {!free ? (
          <div className="pl-fade relative w-[150px]">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-bold text-[var(--p-muted)]">GHS</span>
            <input className="pl-input !pl-[56px] tabular-nums" inputMode="decimal" autoFocus value={amount} placeholder="0" onChange={(e) => onAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
        ) : null}
      </div>
    </div>
  );

  const audience = (value: Audience, onChange: (a: Audience) => void) => (
    <div>
      <span className="pl-label">Who can come?</span>
      <div className="flex flex-wrap gap-2">
        {AUDIENCES.map((a) => (
          <button key={a.v} type="button" className="pl-chip !min-h-[40px] !text-[14px]" aria-pressed={value === a.v} onClick={() => onChange(a.v)}>
            {a.l}
          </button>
        ))}
      </div>
      {value !== "everyone" ? <p className="pl-hint mt-1.5">Only if nobody else can come in. Free entry for ladies is still Everyone.</p> : null}
    </div>
  );

  return (
    <div>
      <div className="pl-up mb-5">
        <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">What&apos;s on</h1>
        <p className="mt-1 text-[15px] text-[var(--p-muted)]">Your nights are the reason somebody picks you over the place next door. We build evenings around them.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="pl-card pl-up pl-lift flex flex-col items-start gap-2 p-4 text-left"
          style={{ animationDelay: "40ms" }}
          onClick={() => {
            setError(null);
            setWeekly(newWeekly());
          }}
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--p-accent-soft)] text-[22px]">🔁</span>
          <span className="text-[16px] font-bold leading-tight">Every week</span>
          <span className="text-[13px] leading-snug text-[var(--p-muted)]">Karaoke Thursdays, a band every Friday</span>
          <span className="mt-1 inline-flex items-center gap-1 text-[14px] font-bold text-[var(--p-accent)]">
            <IconPlus size={16} /> Add
          </span>
        </button>
        <button
          type="button"
          className="pl-card pl-up pl-lift flex flex-col items-start gap-2 p-4 text-left"
          style={{ animationDelay: "90ms" }}
          onClick={() => {
            setError(null);
            setEvent(newEvent());
          }}
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--p-accent-soft)] text-[22px]">📅</span>
          <span className="text-[16px] font-bold leading-tight">One date</span>
          <span className="text-[13px] leading-snug text-[var(--p-muted)]">A festival, a guest DJ, a special dinner</span>
          <span className="mt-1 inline-flex items-center gap-1 text-[14px] font-bold text-[var(--p-accent)]">
            <IconPlus size={16} /> Add
          </span>
        </button>
      </div>

      {/* ── Every week ── */}
      <section className="mt-7">
        <h2 className="pl-up mb-3 text-[21px] font-bold" style={{ animationDelay: "120ms" }}>
          Every week
        </h2>
        {weeklySorted.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {weeklySorted.map((s, n) => (
              <button
                key={s.id}
                type="button"
                onClick={() => editWeekly(s)}
                className="pl-card pl-up pl-lift flex items-center gap-4 p-4 text-left"
                style={{ animationDelay: `${150 + n * 50}ms` }}
              >
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--p-ink)] text-[15px] font-bold uppercase tracking-wide text-white">
                  {DAY_SHORT[s.weekday]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-bold">{s.title}</span>
                  <span className="block text-[14px] text-[var(--p-muted)]">
                    {pretty(toClock(s.starts_minute))} to {pretty(toClock(s.ends_minute))}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[var(--p-ok-soft)] px-2 py-0.5 text-[12px] font-bold text-[var(--p-ok)]">
                      {Number(s.cover_ghs) > 0 ? `GHS ${Number(s.cover_ghs)} in` : "Free entry"}
                    </span>
                    {s.audience && s.audience !== "everyone" ? (
                      <span className="rounded-full bg-[var(--p-accent-soft)] px-2 py-0.5 text-[12px] font-bold text-[var(--p-accent-dark)]">
                        {s.audience === "women" ? "Ladies only" : "Men only"}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="pl-card pl-up p-5 text-[14.5px] text-[var(--p-muted)]" style={{ animationDelay: "150ms" }}>
            Nothing weekly yet. If you do something on the same night every week, add it once and we&apos;ll mention it to anybody whose evening overlaps it.
          </p>
        )}
      </section>

      {/* ── Coming up ── */}
      <section className="mt-7">
        <h2 className="pl-up mb-3 text-[21px] font-bold" style={{ animationDelay: "160ms" }}>
          Coming up
        </h2>
        {upcoming.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.map((e, n) => (
              <EventCard key={e.id} e={e} delay={190 + n * 50} onClick={() => editEvent(e)} />
            ))}
          </div>
        ) : (
          <div className="pl-card pl-up flex items-center gap-4 p-5" style={{ animationDelay: "190ms" }}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--p-sunken)] text-[var(--p-muted)]">
              <IconCalendar size={24} />
            </span>
            <p className="text-[14.5px] text-[var(--p-muted)]">No one-off events coming up. Add one and it can lead somebody&apos;s evening on that date.</p>
          </div>
        )}
      </section>

      {past.length ? (
        <section className="mt-7">
          <button type="button" className="text-[14.5px] font-bold text-[var(--p-muted)]" onClick={() => setShowPast((x) => !x)}>
            {showPast ? "Hide" : "Show"} past events ({past.length})
          </button>
          {showPast ? (
            <div className="pl-card pl-fade mt-3 divide-y divide-[var(--p-line)]">
              {past.slice(0, 20).map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{e.title}</span>
                    <span className="block text-[13px] text-[var(--p-muted)]">
                      {new Date(`${e.event_date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </span>
                  <button type="button" className="pl-btn-soft !min-h-[40px] !px-3.5 !text-[14px]" onClick={() => editEvent(e, true)}>
                    <IconCopy size={16} /> Run again
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── Weekly sheet ── */}
      <Sheet open={Boolean(weekly)} onClose={() => setWeekly(null)} title={weekly?.id ? "Edit weekly night" : "Every week"}>
        {weekly ? (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void saveWeekly();
            }}
          >
            <label className="block">
              <span className="pl-label">What is it called?</span>
              <input className="pl-input" autoFocus={!weekly.id} value={weekly.title} placeholder="Karaoke night" onChange={(e) => setWeekly({ ...weekly, title: e.target.value })} />
            </label>
            <div>
              <span className="pl-label">Which day?</span>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEK.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={weekly.day === d}
                    onClick={() => setWeekly({ ...weekly, day: d })}
                    className={`pl-tap rounded-xl py-3 text-[13.5px] font-bold transition-colors ${
                      weekly.day === d ? "bg-[var(--p-accent)] text-white" : "bg-white text-[var(--p-ink-2)] ring-1 ring-[var(--p-line)]"
                    }`}
                  >
                    {DAY_SHORT[d]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="pl-label">Starts</span>
                <input type="time" className="pl-input" value={weekly.from} onChange={(e) => setWeekly({ ...weekly, from: e.target.value })} />
              </label>
              <label className="block">
                <span className="pl-label">Ends</span>
                <input type="time" className="pl-input" value={weekly.to} onChange={(e) => setWeekly({ ...weekly, to: e.target.value })} />
              </label>
            </div>
            {price(
              weekly.free,
              weekly.cover,
              (f) => setWeekly({ ...weekly, free: f }),
              (a) => setWeekly({ ...weekly, cover: a }),
              "Entry"
            )}
            {audience(weekly.audience, (a) => setWeekly({ ...weekly, audience: a }))}
            {errorLine}
            <button type="submit" className="pl-btn w-full" disabled={busy}>
              {busy ? "Saving…" : weekly.id ? "Save" : `Put it on every ${DAY_LONG[weekly.day]}`}
            </button>
            {weekly.id ? (
              <button type="button" className="py-1 text-[14.5px] font-bold text-[#b42318]" disabled={busy} onClick={() => void removeWeekly()}>
                Stop this night
              </button>
            ) : null}
          </form>
        ) : null}
      </Sheet>

      {/* ── Event sheet ── */}
      <Sheet open={Boolean(event)} onClose={() => setEvent(null)} title={event?.id ? "Edit event" : "One date"}>
        {event ? (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEvent();
            }}
          >
            <label className="block">
              <span className="pl-label">What is it called?</span>
              <input className="pl-input" autoFocus={!event.id} value={event.title} placeholder="Highlife Friday with the Ebo Taylor band" onChange={(e) => setEvent({ ...event, title: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="pl-label">Date</span>
                <input type="date" className="pl-input" min={today} value={event.date} onChange={(e) => setEvent({ ...event, date: e.target.value })} />
              </label>
              <label className="block">
                <span className="pl-label">Starts</span>
                <input type="time" className="pl-input" value={event.time} onChange={(e) => setEvent({ ...event, time: e.target.value })} />
              </label>
            </div>
            <div>
              <span className="pl-label">What kind of event?</span>
              <div className="flex flex-wrap gap-2">
                {KINDS.map((k) => (
                  <button key={k.id} type="button" className="pl-chip !min-h-[40px] !text-[14px]" aria-pressed={event.kind === k.id} onClick={() => setEvent({ ...event, kind: k.id })}>
                    {k.emoji} {k.label}
                  </button>
                ))}
                <button type="button" className="pl-chip !min-h-[40px] !text-[14px]" aria-pressed={event.kind === "custom"} onClick={() => setEvent({ ...event, kind: "custom" })}>
                  Something else…
                </button>
              </div>
              {event.kind === "custom" ? (
                <input className="pl-input pl-fade mt-2" autoFocus value={event.customKind} placeholder="Wine tasting" onChange={(e) => setEvent({ ...event, customKind: e.target.value })} />
              ) : null}
            </div>
            {price(
              event.free,
              event.cost,
              (f) => setEvent({ ...event, free: f }),
              (a) => setEvent({ ...event, cost: a }),
              "Price at the door"
            )}
            <div>
              <span className="pl-label">
                Poster <span className="font-semibold text-[var(--p-muted)]">· optional, but it gets people to come</span>
              </span>
              <PosterUpload value={event.image} onChange={(u) => setEvent({ ...event, image: u })} folder="events" />
            </div>
            <label className="block">
              <span className="pl-label">
                Tell people about it <span className="font-semibold text-[var(--p-muted)]">· optional</span>
              </span>
              <textarea className="pl-input" maxLength={600} value={event.description} placeholder="Who's playing, what's included, anything to know." onChange={(e) => setEvent({ ...event, description: e.target.value })} />
            </label>
            <div>
              <span className="pl-label">
                What&apos;s the mood? <span className="font-semibold text-[var(--p-muted)]">· up to 3</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {VENUE_VIBE_TAGS.map((t) => {
                  const on = event.vibes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      className="pl-chip !min-h-[38px] !text-[13.5px]"
                      aria-pressed={on}
                      disabled={!on && event.vibes.length >= 3}
                      onClick={() => setEvent({ ...event, vibes: on ? event.vibes.filter((x) => x !== t) : [...event.vibes, t] })}
                    >
                      {vibeLabel(t)}
                    </button>
                  );
                })}
              </div>
            </div>
            {audience(event.audience, (a) => setEvent({ ...event, audience: a }))}
            <label className="block">
              <span className="pl-label">
                Number for questions <span className="font-semibold text-[var(--p-muted)]">· optional</span>
              </span>
              <input className="pl-input" inputMode="tel" value={event.phone} placeholder="+233 …" onChange={(e) => setEvent({ ...event, phone: e.target.value })} />
            </label>
            {errorLine}
            <button type="submit" className="pl-btn w-full" disabled={busy}>
              {busy ? "Saving…" : event.id ? "Save" : "Put it on"}
            </button>
            {event.id ? (
              <button type="button" className="py-1 text-[14.5px] font-bold text-[#b42318]" disabled={busy} onClick={() => void removeEvent()}>
                Take it down
              </button>
            ) : null}
          </form>
        ) : null}
      </Sheet>
      {toast}
    </div>
  );
}

function EventCard({ e, delay, onClick }: { e: EventRow; delay: number; onClick: () => void }) {
  const d = new Date(`${e.event_date}T12:00:00`);
  const k = kindOf(e.category);
  return (
    <button type="button" onClick={onClick} className="pl-card pl-up pl-lift flex items-stretch gap-0 overflow-hidden text-left" style={{ animationDelay: `${delay}ms` }}>
      {e.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.image_url} alt="" className="w-[92px] shrink-0 object-cover" />
      ) : (
        <span className="grid w-[92px] shrink-0 place-items-center bg-[var(--p-accent-soft)] text-[34px]">{k?.emoji ?? "🎉"}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-4">
        <span className="text-[12.5px] font-bold uppercase tracking-[0.06em] text-[var(--p-accent)]">
          {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          {e.start_time ? ` · ${pretty(e.start_time.slice(0, 5))}` : ""}
        </span>
        <span className="truncate text-[16px] font-bold">{e.title}</span>
        <span className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--p-ok-soft)] px-2 py-0.5 text-[12px] font-bold text-[var(--p-ok)]">
            {Number(e.cost_ghs) > 0 ? `GHS ${Number(e.cost_ghs)}` : e.cost_ghs == null ? "No price yet" : "Free"}
          </span>
          {k ? <span className="rounded-full bg-[var(--p-sunken)] px-2 py-0.5 text-[12px] font-bold text-[var(--p-ink-2)]">{k.label}</span> : null}
        </span>
      </span>
    </button>
  );
}
