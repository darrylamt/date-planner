"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImageField } from "./ImageField";

export interface PhotoRow {
  id: string;
  name: string;
  area: string;
  type: string;
  cover: string | null;
  gallery: number;
}

export interface PosterRow {
  id: string;
  title: string;
  date: string;
  venue: string;
  image: string | null;
}

/** The list on the Photos page: the venues needing pictures, or the events needing an image. */
export function PhotoQueue({ tab, venues, events }: { tab: "venues" | "events"; venues: PhotoRow[]; events: PosterRow[] }) {
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const q = query.trim().toLowerCase();

  const shownVenues = useMemo(
    () =>
      venues
        .filter((v) => !q || `${v.name} ${v.area}`.toLowerCase().includes(q))
        .filter((v) => !onlyMissing || !v.cover || v.gallery < 3)
        .sort((a, b) => Number(Boolean(a.cover)) - Number(Boolean(b.cover)) || a.gallery - b.gallery || a.name.localeCompare(b.name)),
    [venues, q, onlyMissing]
  );
  const shownEvents = useMemo(
    () => events.filter((e) => !q || `${e.title} ${e.venue}`.toLowerCase().includes(q)).filter((e) => !onlyMissing || !e.image),
    [events, q, onlyMissing]
  );

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className="inp max-w-[320px]" placeholder="Search by name or area" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Only the ones that need pictures
        </label>
      </div>

      {tab === "venues" ? (
        <div className="card mt-4 overflow-x-auto p-0">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Venue</th>
                <th>Cover</th>
                <th>More pictures</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shownVenues.slice(0, 200).map((v) => (
                <tr key={v.id}>
                  <td>
                    <div className="font-semibold">{v.name}</div>
                    <div className="text-[12px] text-mutedbrown">
                      {v.area} · {v.type}
                    </div>
                  </td>
                  <td>
                    {v.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.cover} alt="" className="h-10 w-14 rounded-md object-cover" />
                    ) : (
                      <span className="badge b-stale">None</span>
                    )}
                  </td>
                  <td className="tabular-nums">{v.gallery}</td>
                  <td className="text-right">
                    <Link href={`/admin/photos/${v.id}`} className="btn2 btnsm">
                      Edit photos
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shownVenues.length === 0 ? <div className="p-6 text-center text-mutedbrown">Nothing here. Every venue has its pictures.</div> : null}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {shownEvents.slice(0, 100).map((e) => (
            <PosterCard key={e.id} event={e} />
          ))}
          {shownEvents.length === 0 ? <div className="why">Every upcoming event has an image.</div> : null}
        </div>
      )}
    </div>
  );
}

/** One event's image, saved the moment it is set. */
function PosterCard({ event }: { event: PosterRow }) {
  const [url, setUrl] = useState(event.image ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(next: string) {
    setUrl(next);
    setState("saving");
    const { error } = await createClient().from("events").update({ image_url: next || null }).eq("id", event.id);
    setState(error ? "error" : "saved");
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{event.title}</div>
          <div className="text-[12px] text-mutedbrown">
            {new Date(`${event.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
            {event.venue ? ` · ${event.venue}` : ""}
          </div>
        </div>
        <span className="text-[12px] text-mutedbrown">
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Didn't save" : ""}
        </span>
      </div>
      <ImageField label="Event image" value={url} onChange={save} folder="events" hint="The poster, or a real photo of the night" />
    </div>
  );
}
