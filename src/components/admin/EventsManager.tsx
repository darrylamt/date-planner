"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ADMIN_PAGE_SIZE, Pager, SearchBox, usePagedRows } from "./TableControls";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import type { Area, EventRow } from "@/lib/types";
import { ImageField } from "./ImageField";

const CATEGORIES = ["live_music", "sip_and_paint", "festival", "run_club", "workshop", "film_night", "other"];

const EMPTY = {
  title: "",
  description: "",
  area_id: "",
  venue_id: "",
  event_date: "",
  start_time: "",
  cost_ghs: "",
  category: "live_music",
  source_url: "",
  image_url: "",
  contact_phone: "",
  vibe_tags: "",
  reservation_required: false,
  booking_url: "",
};

export function EventsManager({
  events,
  areas,
  venues,
}: {
  events: EventRow[];
  areas: Area[];
  venues: { id: string; name: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({ ...EMPTY, area_id: areas[0]?.id ?? "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Over is over, whatever the switch says.
   *
   * The planner only ever reads the plan's own date and drops a night that
   * has already started, so a finished event can never reach a plan. The list
   * is where it lingered, reading "Active" about something that happened last
   * month; it now says Past, and sits at the end.
   */
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowTime = now.toISOString().slice(11, 16);
  const isPast = (e: EventRow) =>
    e.event_date < today || (e.event_date === today && !!e.start_time && e.start_time.slice(0, 5) <= nowTime);
  const ordered = [...events.filter((e) => !isPast(e)), ...events.filter(isPast)];

  const paged = usePagedRows(ordered, (e, needle) => {
    const area = areas.find((a) => a.id === e.area_id)?.name ?? "";
    return (
      e.title.toLowerCase().includes(needle) ||
      e.event_date.includes(needle) ||
      area.toLowerCase().includes(needle)
    );
  });

  function startEdit(e: EventRow) {
    setEditingId(e.id);
    setForm({
      title: e.title,
      description: e.description ?? "",
      area_id: e.area_id,
      venue_id: e.venue_id ?? "",
      event_date: e.event_date,
      start_time: e.start_time?.slice(0, 5) ?? "",
      cost_ghs: e.cost_ghs === null ? "" : String(e.cost_ghs),
      category: e.category,
      source_url: e.source_url ?? "",
      image_url: e.image_url ?? "",
      contact_phone: e.contact_phone ?? "",
      vibe_tags: (e.vibe_tags ?? []).join(", "),
      reservation_required: e.reservation_required ?? false,
      booking_url: e.booking_url ?? "",
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      title: form.title,
      /*
       * Sent only where the column exists or somebody wrote one. Until
       * migration 0058 runs, naming the column fails the whole save, and an
       * event with no description should not be what breaks the admin.
       * Rows come from select("*"), so the key is there exactly when it is.
       */
      ...(form.description.trim() || events.some((e) => "description" in e)
        ? { description: form.description.trim() || null }
        : {}),
      area_id: form.area_id,
      venue_id: form.venue_id || null,
      event_date: form.event_date,
      start_time: form.start_time || null,
      cost_ghs: form.cost_ghs === "" ? null : Number(form.cost_ghs),
      category: form.category,
      source_url: form.source_url || null,
      image_url: form.image_url.trim() || null,
      /*
       * Written live, not into the approval queue.
       *
       * venues.phone earns its queue: migrations 0013, 0014 and 0028 exist
       * because those numbers were read off Instagram and Google Maps, and a
       * wrong one sends somebody to a stranger with a message signed "sent
       * via aduro". A number attached to a single event is given by whoever
       * is running it, and expires with the event, so there is no queue for
       * it to sit in and no listing for it to leak onto.
       */
      contact_phone: form.contact_phone.trim() || null,
      /*
       * The event's own tags, not the venue's.
       *
       * A warehouse is not "loud" on a Tuesday and is on the night of the
       * rave. Empty is left empty rather than copied from the venue, so the
       * planner can tell "nobody said" from "the same as usual".
       */
      vibe_tags: form.vibe_tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      reservation_required: form.reservation_required,
      booking_url: form.booking_url.trim() || null,
    };
    const q = editingId
      ? supabase.from("events").update(payload).eq("id", editingId)
      : supabase.from("events").insert(payload);
    const { error } = await q;
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ ...EMPTY, area_id: areas[0]?.id ?? "" });
    setEditingId(null);
    setToast("Event saved");
    setTimeout(() => setToast(null), 1800);
    router.refresh();
  }

  async function toggleActive(e: EventRow) {
    await supabase.from("events").update({ is_active: !e.is_active }).eq("id", e.id);
    router.refresh();
  }

  async function remove(e: EventRow) {
    if (!confirm(`Delete "${e.title}"?`)) return;
    await supabase.from("events").delete().eq("id", e.id);
    router.refresh();
  }

  return (
    <div className="max-w-[860px]">
      <h1 className="font-display text-[24px] font-bold">Events</h1>
      <div className="text-[14px] text-mutedbrown">
        Live music, sip &amp; paint, festivals, what makes a date memorable.
      </div>

      {/* Add / edit form */}
      <div className="card mt-5 grid gap-3 p-5 md:grid-cols-3">
        <div className="md:col-span-2">
          <span className="flbl">Title</span>
          <input className="inp h-[42px]" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <span className="flbl">Category</span>
          <select className="inp h-[42px]" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        {/*
          What the night is, in a sentence or two. The title says "Jazz at
          Bistro 22"; this says who is playing and whether it is dinner with a
          band or a band with a bar.
        */}
        <div className="md:col-span-3">
          <span className="flbl">Description</span>
          <textarea
            className="inp min-h-[72px] py-2"
            maxLength={400}
            placeholder="Who is playing, what to expect, what to wear"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div>
          <span className="flbl">Area</span>
          <select className="inp h-[42px]" value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="flbl">Venue (optional)</span>
          <select className="inp h-[42px]" value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
            <option value="">No venue</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="flbl">Date</span>
          <input type="date" className="inp h-[42px]" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
        </div>
        <div>
          <span className="flbl">Start time</span>
          <input type="time" className="inp h-[42px]" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
        </div>
        <div>
          <span className="flbl">Ticket (GHS)</span>
          <input
            type="number"
            className="inp h-[42px] font-mono"
            placeholder="0 if free"
            value={form.cost_ghs}
            onChange={(e) => setForm({ ...form, cost_ghs: e.target.value })}
          />
          {/* This said "blank = free" and blank has never meant free: it
              writes null, and matching.ts reads null as unpriced, which
              withholds a menu-less venue from the shortfall entirely. */}
          <span className="mt-1.5 block text-[12px] text-mutedbrown">
            0 is free. Blank is unknown, and keeps the venue out of budgeted plans.
          </span>
        </div>
        <div>
          <span className="flbl">Source URL</span>
          <input className="inp h-[42px]" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
        </div>
        <div>
          <span className="flbl">Vibe tags</span>
          <input
            className="inp h-[42px]"
            placeholder="loud, outdoor, live band"
            value={form.vibe_tags}
            onChange={(e) => setForm({ ...form, vibe_tags: e.target.value })}
          />
          <span className="mt-1.5 block text-[12px] text-mutedbrown">
            Commas. What this night is like, not what the place usually is.
          </span>
        </div>
        <div>
          <span className="flbl">Booking page</span>
          <input
            className="inp h-[42px]"
            placeholder="https://..."
            value={form.booking_url}
            onChange={(e) => setForm({ ...form, booking_url: e.target.value })}
          />
          {/* Ahead of the venue's own link and both its numbers: a ticketed
              night at a restaurant is not booked through the restaurant. */}
          <span className="mt-1.5 block text-[12px] text-mutedbrown">
            Used instead of the venue&apos;s, for this night only.
          </span>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-[14px]">
            <input
              type="checkbox"
              checked={form.reservation_required}
              onChange={(e) => setForm({ ...form, reservation_required: e.target.checked })}
            />
            Needs booking
          </label>
        </div>
        <div>
          <span className="flbl">Who to call about it</span>
          <input
            className="inp h-[42px] font-mono"
            inputMode="tel"
            placeholder="+233 ..."
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
          />
          {/* Every other phone field in this admin writes to a queue. This
              one does not, and there is no way to tell by looking. */}
          <span className="mt-1.5 block text-[12px] text-mutedbrown">
            Live immediately, no approval. This event only.
          </span>
        </div>
        {/*
          The poster. An event is the one stop where the venue's usual
          photograph is a picture of the wrong thing, and a poster almost
          always exists as a file on somebody's phone rather than as a URL.
        */}
        <div className="md:col-span-3">
          <ImageField
            label="Poster or picture"
            value={form.image_url}
            onChange={(image_url) => setForm({ ...form, image_url })}
            folder="events"
            hint="Shown first on the stop, ahead of the venue's own picture"
          />
        </div>
        <div className="flex items-end gap-2 md:col-span-3">
          <button
            className="btn btnsm px-7"
            onClick={save}
            disabled={busy || !form.title.trim() || !form.event_date}
          >
            {editingId ? "Update event" : "Add event"}
          </button>
          {editingId && (
            <button
              className="btn2 btnsm"
              onClick={() => {
                setEditingId(null);
                setForm({ ...EMPTY, area_id: areas[0]?.id ?? "" });
              }}
            >
              Cancel
            </button>
          )}
        </div>
        {error && <div className="why not-italic text-staletext md:col-span-3">{error}</div>}
      </div>

      {/* List */}
      {events.length > ADMIN_PAGE_SIZE ? (
        <div className="mt-6">
          <SearchBox
            value={paged.query}
            onChange={paged.setQuery}
            placeholder="Search title, date or area"
          />
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Event</th>
              <th>Date</th>
              <th>Area</th>
              <th>Ticket</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.pageRows.map((e) => (
              <tr key={e.id} className={e.is_active && !isPast(e) ? "" : "opacity-50"}>
                <td className="font-bold">{e.title}</td>
                <td className="font-mono">{e.event_date}</td>
                <td>{areas.find((a) => a.id === e.area_id)?.name ?? "anywhere"}</td>
                <td className="font-mono">{e.cost_ghs === null ? "free" : `GHS ${e.cost_ghs}`}</td>
                <td>
                  <span className={`badge ${e.is_active && !isPast(e) ? "b-ok" : "b-stale"}`}>
                    {isPast(e) ? "Past" : e.is_active ? "Active" : "Hidden"}
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  <button className="font-semibold text-flame hover:text-flame-dark" onClick={() => startEdit(e)}>
                    Edit
                  </button>
                  <button className="ml-3 font-semibold text-mutedbrown hover:text-ink" onClick={() => toggleActive(e)}>
                    {e.is_active ? "Hide" : "Show"}
                  </button>
                  <button className="ml-3 font-semibold text-staletext hover:underline" onClick={() => remove(e)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {paged.total === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-mutedbrown">
                  {paged.query ? `No event matches “${paged.query}”.` : "No events yet."}
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
        unit="events"
        onGoTo={paged.goTo}
      />

      {toast && <Toast message={toast} />}
    </div>
  );
}
