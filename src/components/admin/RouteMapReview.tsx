"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fareText } from "@/lib/transit";
import type { LineSummary } from "@/app/admin/getting-around/page";

type Filter = "unchecked" | "confirmed" | "hidden" | "all";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Checking the 2019 route map, a corridor at a time.
 *
 * The map is six years old. Nothing on it is wrong because it is old, but
 * nothing on it is right because it was once. So every line starts unchecked,
 * the page tells visitors so, and this is where a line earns "checked": ride
 * it or ask somebody who does, then confirm it, add what the mate calls and
 * the fare. A line that no longer runs is hidden, not deleted, so a re-import
 * cannot bring it back.
 *
 * Sorted by how many of our venues sit near it, because that is where a
 * check pays off.
 */
export function RouteMapReview({ lines, say }: { lines: LineSummary[] | null; say: (m: string) => void }) {
  const [filter, setFilter] = useState<Filter>("unchecked");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(20);

  const groups = useMemo(() => {
    if (!lines) return [];
    const by = new Map<string, LineSummary[]>();
    for (const l of lines) {
      const key = l.gtfs_route_id ?? l.id;
      const list = by.get(key) ?? [];
      list.push(l);
      by.set(key, list);
    }
    const q = query.trim().toLowerCase();
    return [...by.values()]
      .filter((dirs) => filter === "all" || dirs.some((d) => d.status === filter))
      .filter((dirs) => !q || dirs.some((d) => d.name.toLowerCase().includes(q) || (d.headsign ?? "").toLowerCase().includes(q)))
      .sort((a, b) => Math.max(...b.map((d) => d.near_venues)) - Math.max(...a.map((d) => d.near_venues)));
  }, [lines, filter, query]);

  if (!lines) {
    return (
      <div className="card p-5 text-[14px]">
        <b>The route map is not loaded.</b>
        <div className="mt-2 text-mutedbrown">
          Run migration <code>0060_trotro_lines.sql</code> in Supabase, then <code>npm run transit:import</code> from the
          project folder, and reload.
        </div>
      </div>
    );
  }
  if (!lines.length) {
    return (
      <div className="card p-5 text-[14px]">
        The tables exist but are empty. Run <code>npm run transit:import</code> to load the 2019 route map.
      </div>
    );
  }

  const counts = {
    unchecked: lines.filter((l) => l.status === "unchecked").length,
    confirmed: lines.filter((l) => l.status === "confirmed").length,
    hidden: lines.filter((l) => l.status === "hidden").length,
  };

  return (
    <>
      <div className="card p-4 text-[13px] text-mutedbrown">
        One card per route, both directions inside. Confirm a direction only after riding it or checking with someone
        who does. Most useful first: the number is how many of our venues are within 500 m of a stop on it.{" "}
        <Link href="/getting-there" target="_blank" className="font-semibold text-flame">
          Try the planner ↗
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input className="inp h-[40px] max-w-[280px]" placeholder="Search a route or place" value={query} onChange={(e) => setQuery(e.target.value)} />
        {(["unchecked", "confirmed", "hidden", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => (setFilter(f), setShown(20))}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
              filter === f ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-black/10"
            }`}
          >
            {f === "all" ? `All ${lines.length}` : `${f[0].toUpperCase()}${f.slice(1)} ${counts[f]}`}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        {groups.slice(0, shown).map((dirs) => (
          <RouteCard key={dirs[0].gtfs_route_id ?? dirs[0].id} dirs={dirs} say={say} />
        ))}
      </div>
      {groups.length > shown ? (
        <button className="btn2 btnsm mt-4" onClick={() => setShown(shown + 20)}>
          Show more ({groups.length - shown} left)
        </button>
      ) : null}
      {!groups.length ? <div className="mt-6 text-center text-mutedbrown">Nothing here.</div> : null}
    </>
  );
}

function RouteCard({ dirs, say }: { dirs: LineSummary[]; say: (m: string) => void }) {
  const near = Math.max(...dirs.map((d) => d.near_venues));
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b className="text-[15px]">{dirs[0].name}</b>
        <span className="text-[12px] text-mutedbrown">
          {near} venue{near === 1 ? "" : "s"} nearby
        </span>
      </div>
      <div className="mt-3 grid gap-3">
        {dirs.map((d) => (
          <Direction key={d.id} line={d} say={say} />
        ))}
      </div>
    </div>
  );
}

interface StopRow {
  seq: number;
  minutes: number | null;
  trotro_stops: { id: string; name: string; landmark: string | null; lat: number; lng: number } | null;
}

function Direction({ line, say }: { line: LineSummary; say: (m: string) => void }) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    called_as: line.called_as ?? "",
    fare_min: line.fare_min_ghs == null ? "" : String(line.fare_min_ghs),
    fare_max: line.fare_max_ghs == null ? "" : String(line.fare_max_ghs),
    notes: line.notes ?? "",
  });
  const [stops, setStops] = useState<StopRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function set(patch: Record<string, unknown>, message: string) {
    setError(null);
    const { error } = await supabase.from("trotro_lines").update(patch).eq("id", line.id);
    if (error) return setError(error.message);
    say(message);
    router.refresh();
  }

  async function saveDetails(confirm: boolean) {
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    await set(
      {
        called_as: form.called_as.trim() || null,
        fare_min_ghs: num(form.fare_min),
        fare_max_ghs: num(form.fare_max),
        notes: form.notes.trim() || null,
        ...(confirm ? { status: "confirmed", checked_on: today() } : {}),
      },
      confirm ? "Confirmed" : "Saved"
    );
    setEditing(false);
  }

  async function loadStops() {
    if (stops) return setStops(null);
    const { data, error } = await supabase
      .from("trotro_line_stops")
      .select("seq, minutes, trotro_stops(id, name, landmark, lat, lng)")
      .eq("line_id", line.id)
      .order("seq");
    if (error) return setError(error.message);
    setStops((data ?? []) as unknown as StopRow[]);
  }

  const badge =
    line.status === "confirmed" ? (
      <span className="badge b-ok">confirmed {line.checked_on ?? ""}</span>
    ) : line.status === "hidden" ? (
      <span className="badge b-stale">hidden</span>
    ) : (
      <span className="badge b-stale">unchecked</span>
    );

  return (
    <div className={`rounded-xl border border-black/10 p-3 ${line.status === "hidden" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[14px]">
          Towards <b>{line.headsign ?? "?"}</b>
          <span className="text-mutedbrown">
            {" "}
            · {line.stop_count} stops{line.headway_mins ? ` · every ~${line.headway_mins} min` : ""}
            {fareText(line.fare_min_ghs, line.fare_max_ghs) ? ` · ${fareText(line.fare_min_ghs, line.fare_max_ghs)}` : ""}
            {line.called_as ? ` · called "${line.called_as}"` : ""}
          </span>
        </div>
        {badge}
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[13px] font-semibold">
        {line.status !== "confirmed" ? (
          <button className="text-flame" onClick={() => setEditing(true)}>
            Confirm…
          </button>
        ) : (
          <button className="text-flame" onClick={() => setEditing(!editing)}>
            Edit
          </button>
        )}
        {line.status !== "hidden" ? (
          <button className="text-staletext" onClick={() => set({ status: "hidden" }, "Hidden")}>
            Hide, no longer runs
          </button>
        ) : (
          <button className="text-mutedbrown" onClick={() => set({ status: "unchecked" }, "Restored")}>
            Restore
          </button>
        )}
        {line.status === "confirmed" ? (
          <button className="text-mutedbrown" onClick={() => set({ status: "unchecked", checked_on: null }, "Back to unchecked")}>
            Mark unchecked
          </button>
        ) : null}
        <button className="text-mutedbrown" onClick={loadStops}>
          {stops ? "Hide stops" : "Stops and landmarks"}
        </button>
      </div>

      {editing ? (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <div className="md:col-span-2">
            <span className="flbl">What the mate calls out</span>
            <input className="inp h-[38px]" value={form.called_as} placeholder="Madina! Madina!" onChange={(e) => setForm({ ...form, called_as: e.target.value })} />
          </div>
          <div>
            <span className="flbl">Fare from (GHS)</span>
            <input className="inp h-[38px] font-mono" value={form.fare_min} onChange={(e) => setForm({ ...form, fare_min: e.target.value })} />
          </div>
          <div>
            <span className="flbl">Fare to (GHS)</span>
            <input className="inp h-[38px] font-mono" value={form.fare_max} placeholder="same if fixed" onChange={(e) => setForm({ ...form, fare_max: e.target.value })} />
          </div>
          <div className="md:col-span-4">
            <span className="flbl">Notes</span>
            <input className="inp h-[38px]" value={form.notes} placeholder="Now loads at the new terminal; slow after 4pm" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-2 md:col-span-4">
            {line.status !== "confirmed" ? (
              <button className="btn btnsm px-5" onClick={() => saveDetails(true)}>
                Confirm, checked today
              </button>
            ) : null}
            <button className="btn2 btnsm px-5" onClick={() => saveDetails(false)}>
              Save without confirming
            </button>
            <button className="btn2 btnsm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {stops ? <StopList stops={stops} say={say} /> : null}
      {error ? <div className="mt-2 text-[13px] text-staletext">{error}</div> : null}
    </div>
  );
}

/**
 * The stops, in riding order, each with a name a newcomer can use.
 *
 * The map calls thirty-eight stops "Junction". A landmark set here replaces
 * that name everywhere the planner shows the stop, on every line through it.
 */
function StopList({ stops, say }: { stops: StopRow[]; say: (m: string) => void }) {
  const supabase = createClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function saveLandmark(id: string) {
    const value = (drafts[id] ?? "").trim();
    const { error } = await supabase.from("trotro_stops").update({ landmark: value || null }).eq("id", id);
    say(error ? `Could not save: ${error.message}` : "Landmark saved");
  }

  return (
    <ol className="mt-3 grid gap-1.5 border-t border-black/10 pt-3 text-[13px]">
      {stops.map((row) => {
        const s = row.trotro_stops;
        if (!s) return null;
        const value = drafts[s.id] ?? s.landmark ?? "";
        return (
          <li key={row.seq} className="grid grid-cols-[28px_1fr_auto] items-center gap-2">
            <span className="font-mono text-mutedbrown">{row.seq}</span>
            <div className="flex flex-wrap items-center gap-2">
              <a
                className="min-w-[120px] font-semibold underline decoration-dotted"
                href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                {s.name}
              </a>
              <input
                className="inp h-[32px] max-w-[320px] text-[13px]"
                placeholder="Landmark a newcomer would recognise"
                value={value}
                onChange={(e) => setDrafts({ ...drafts, [s.id]: e.target.value })}
                onBlur={() => drafts[s.id] !== undefined && drafts[s.id] !== (s.landmark ?? "") && saveLandmark(s.id)}
              />
            </div>
            <span className="font-mono text-mutedbrown">{row.minutes != null ? `${Math.round(row.minutes)}′` : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}
