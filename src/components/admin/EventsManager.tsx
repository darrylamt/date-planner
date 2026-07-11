"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import type { Area, EventRow } from "@/lib/types";

const CATEGORIES = ["live_music", "sip_and_paint", "festival", "run_club", "workshop", "film_night", "other"];

const EMPTY = {
  title: "",
  area_id: "",
  venue_id: "",
  event_date: "",
  start_time: "",
  cost_ghs: "",
  category: "live_music",
  source_url: "",
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

  function startEdit(e: EventRow) {
    setEditingId(e.id);
    setForm({
      title: e.title,
      area_id: e.area_id,
      venue_id: e.venue_id ?? "",
      event_date: e.event_date,
      start_time: e.start_time?.slice(0, 5) ?? "",
      cost_ghs: e.cost_ghs === null ? "" : String(e.cost_ghs),
      category: e.category,
      source_url: e.source_url ?? "",
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      title: form.title,
      area_id: form.area_id,
      venue_id: form.venue_id || null,
      event_date: form.event_date,
      start_time: form.start_time || null,
      cost_ghs: form.cost_ghs === "" ? null : Number(form.cost_ghs),
      category: form.category,
      source_url: form.source_url || null,
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
        Live music, sip &amp; paint, festivals — what makes a date memorable.
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
            <option value="">—</option>
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
          <span className="flbl">Ticket (GHS, blank = free)</span>
          <input type="number" className="inp h-[42px] font-mono" value={form.cost_ghs} onChange={(e) => setForm({ ...form, cost_ghs: e.target.value })} />
        </div>
        <div>
          <span className="flbl">Source URL</span>
          <input className="inp h-[42px]" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
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
            {events.map((e) => (
              <tr key={e.id} className={e.is_active ? "" : "opacity-50"}>
                <td className="font-bold">{e.title}</td>
                <td className="font-mono">{e.event_date}</td>
                <td>{areas.find((a) => a.id === e.area_id)?.name ?? "—"}</td>
                <td className="font-mono">{e.cost_ghs === null ? "free" : `GHS ${e.cost_ghs}`}</td>
                <td>
                  <span className={`badge ${e.is_active ? "b-ok" : "b-stale"}`}>
                    {e.is_active ? "Active" : "Hidden"}
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
          </tbody>
        </table>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
