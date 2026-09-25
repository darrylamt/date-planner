"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import type { Area } from "@/lib/types";
import type { AccessVenue, LineSummary } from "@/app/admin/getting-around/page";
import { RouteMapReview } from "./RouteMapReview";
import { fareText, type CarRental, type TrotroRoute, type TrotroStation, type VenueAccess } from "@/lib/transit";

type Tab = "map" | "stations" | "routes" | "venues" | "rentals";

const TABS: { id: Tab; label: string }[] = [
  { id: "map", label: "Route map (2019)" },
  { id: "stations", label: "Stations" },
  { id: "routes", label: "Trotro routes" },
  { id: "venues", label: "Venue directions" },
  { id: "rentals", label: "Car rentals" },
];

/*
 * Names only, for a first pass. These are the big loading stations everybody
 * in Accra knows by name; where exactly to stand in each is left blank for
 * somebody who has been, because that is the part a newcomer cannot guess.
 */
const COMMON_STATIONS = [
  "Circle",
  "37 Station",
  "Madina Station",
  "Kaneshie Station",
  "Tema Station",
  "Achimota Station",
  "Lapaz",
  "Tudu",
];

const today = () => new Date().toISOString().slice(0, 10);
const num = (s: string) => (s.trim() === "" ? null : Number(s));
const txt = (s: string) => s.trim() || null;

/**
 * Everything the "getting there" page reads, entered by hand.
 *
 * There is no current public source for trotro routes, so every row here is
 * somebody's own trip, and each one says when it was last checked. The
 * preview page shows "not checked" for anything without a date, so ticking
 * "checked today" is a claim: tick it only after riding it or confirming it
 * with somebody who does.
 */
export function GettingAroundManager(props: {
  stations: TrotroStation[];
  routes: TrotroRoute[];
  access: VenueAccess[];
  rentals: CarRental[];
  areas: Area[];
  venues: AccessVenue[];
  lines: LineSummary[] | null;
}) {
  const [tab, setTab] = useState<Tab>("map");
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2000);
  };

  const withDirections = props.access.filter((a) => a.landmark || a.station_id).length;
  const confirmed = (props.lines ?? []).filter((l) => l.status === "confirmed").length;

  return (
    <div className="max-w-[980px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-[24px] font-bold">Getting around</h1>
        <Link href="/getting-there" target="_blank" className="btn2 btnsm px-5">
          Open the preview page ↗
        </Link>
      </div>
      <div className="text-[14px] text-mutedbrown">
        How to reach a place without knowing the city: what to tell a driver, which trotro, where to get
        off. {props.lines?.length ?? 0} route-map directions ({confirmed} confirmed), {props.stations.length} stations,{" "}
        {props.routes.length} hand-entered rides, {withDirections} venues with
        directions, {props.rentals.length} rental companies.
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-[14px] font-semibold ${
              tab === t.id ? "bg-flame text-white" : "bg-white text-ink ring-1 ring-black/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "map" && <RouteMapReview lines={props.lines} say={say} />}
        {tab === "stations" && <Stations {...props} say={say} />}
        {tab === "routes" && <Routes {...props} say={say} />}
        {tab === "venues" && <VenueDirections {...props} say={say} />}
        {tab === "rentals" && <Rentals {...props} say={say} />}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}

type Props = Parameters<typeof GettingAroundManager>[0] & { say: (m: string) => void };

function Checked({ on, date, onChange }: { on: boolean; date: string | null; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 pb-2 text-[14px]">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      Checked today
      {date ? <span className="text-[12px] text-mutedbrown">(last {date})</span> : null}
    </label>
  );
}

function CheckedBadge({ date }: { date: string | null }) {
  return date ? (
    <span className="badge b-ok">checked {date}</span>
  ) : (
    <span className="badge b-stale">not checked</span>
  );
}

/* ── stations ─────────────────────────────────────────────────────────── */

function Stations({ stations, areas, say }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const blank = { name: "", area_id: "", lat: "", lng: "", where_exactly: "", is_hub: false, checked: false };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<TrotroStation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(s: TrotroStation) {
    setEditing(s);
    setForm({
      name: s.name,
      area_id: s.area_id ?? "",
      lat: s.lat == null ? "" : String(s.lat),
      lng: s.lng == null ? "" : String(s.lng),
      where_exactly: s.where_exactly ?? "",
      is_hub: s.is_hub,
      checked: false,
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const row = {
      name: form.name.trim(),
      area_id: form.area_id || null,
      lat: num(form.lat),
      lng: num(form.lng),
      where_exactly: txt(form.where_exactly),
      is_hub: form.is_hub,
      ...(form.checked ? { checked_on: today() } : {}),
    };
    const { error } = editing
      ? await supabase.from("trotro_stations").update(row).eq("id", editing.id)
      : await supabase.from("trotro_stations").insert(row);
    setBusy(false);
    if (error) return setError(error.message);
    setForm(blank);
    setEditing(null);
    say("Station saved");
    router.refresh();
  }

  async function addCommon() {
    const have = new Set(stations.map((s) => s.name.toLowerCase()));
    const rows = COMMON_STATIONS.filter((n) => !have.has(n.toLowerCase())).map((name) => ({ name, is_hub: true }));
    if (!rows.length) return say("They are all here already");
    const { error } = await supabase.from("trotro_stations").insert(rows);
    if (error) return setError(error.message);
    say(`Added ${rows.length} stations`);
    router.refresh();
  }

  async function toggle(s: TrotroStation) {
    await supabase.from("trotro_stations").update({ is_active: !s.is_active }).eq("id", s.id);
    router.refresh();
  }

  async function remove(s: TrotroStation) {
    if (!confirm(`Delete ${s.name}? Its routes go with it.`)) return;
    const { error } = await supabase.from("trotro_stations").delete().eq("id", s.id);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <>
      <div className="card grid gap-3 p-5 md:grid-cols-3">
        <div>
          <span className="flbl">Name</span>
          <input className="inp h-[42px]" value={form.name} placeholder="Circle" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <span className="flbl">Area (optional)</span>
          <select className="inp h-[42px]" value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })}>
            <option value="">None</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-[14px]">
            <input type="checkbox" checked={form.is_hub} onChange={(e) => setForm({ ...form, is_hub: e.target.checked })} />
            Big station (a hub people change at)
          </label>
        </div>
        <div>
          <span className="flbl">Latitude</span>
          <input className="inp h-[42px] font-mono" value={form.lat} placeholder="5.5700" onChange={(e) => setForm({ ...form, lat: e.target.value })} />
        </div>
        <div>
          <span className="flbl">Longitude</span>
          <input className="inp h-[42px] font-mono" value={form.lng} placeholder="-0.2140" onChange={(e) => setForm({ ...form, lng: e.target.value })} />
          <span className="mt-1.5 block text-[12px] text-mutedbrown">Right-click the spot in Google Maps to copy both.</span>
        </div>
        <Checked on={form.checked} date={editing?.checked_on ?? null} onChange={(checked) => setForm({ ...form, checked })} />
        <div className="md:col-span-3">
          <span className="flbl">Where exactly to stand</span>
          <textarea
            className="inp min-h-[64px] py-2"
            maxLength={400}
            value={form.where_exactly}
            placeholder="The big stations are a square kilometre. Where do these trotros actually load? Near what?"
            onChange={(e) => setForm({ ...form, where_exactly: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 md:col-span-3">
          <button className="btn btnsm px-7" onClick={save} disabled={busy || form.name.trim().length < 2}>
            {editing ? "Update station" : "Add station"}
          </button>
          {editing ? (
            <button className="btn2 btnsm" onClick={() => (setEditing(null), setForm(blank))}>
              Cancel
            </button>
          ) : (
            <button className="btn2 btnsm" onClick={addCommon}>
              Add the big stations by name
            </button>
          )}
        </div>
        {error && <div className="why not-italic text-staletext md:col-span-3">{error}</div>}
      </div>

      <table className="tbl mt-6 w-full">
        <thead>
          <tr>
            <th>Station</th>
            <th>Where to stand</th>
            <th>Map</th>
            <th>Checked</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {stations.map((s) => (
            <tr key={s.id} className={s.is_active ? "" : "opacity-50"}>
              <td className="font-bold">
                {s.name}
                {s.is_hub ? <span className="ml-2 text-[12px] font-normal text-mutedbrown">hub</span> : null}
              </td>
              <td className="max-w-[320px] text-[13px]">{s.where_exactly ?? <span className="text-staletext">missing</span>}</td>
              <td>{s.lat != null ? "✓" : <span className="text-staletext">no pin</span>}</td>
              <td>
                <CheckedBadge date={s.checked_on} />
              </td>
              <td className="whitespace-nowrap">
                <button className="font-semibold text-flame" onClick={() => edit(s)}>
                  Edit
                </button>
                <button className="ml-3 font-semibold text-mutedbrown" onClick={() => toggle(s)}>
                  {s.is_active ? "Hide" : "Show"}
                </button>
                <button className="ml-3 font-semibold text-staletext" onClick={() => remove(s)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {!stations.length && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-mutedbrown">
                No stations yet. Start with the big ones.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

/* ── routes ───────────────────────────────────────────────────────────── */

function Routes({ stations, routes, say }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const blank = {
    from: "",
    to: "",
    called_as: "",
    board_note: "",
    fare_min: "",
    fare_max: "",
    minutes: "",
    runs: "",
    notes: "",
    checked: false,
    alsoBack: false,
  };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<TrotroRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations]);

  function edit(r: TrotroRoute) {
    setEditing(r);
    setForm({
      from: r.from_station_id,
      to: r.to_station_id,
      called_as: r.called_as ?? "",
      board_note: r.board_note ?? "",
      fare_min: r.fare_min_ghs == null ? "" : String(r.fare_min_ghs),
      fare_max: r.fare_max_ghs == null ? "" : String(r.fare_max_ghs),
      minutes: r.minutes == null ? "" : String(r.minutes),
      runs: r.runs ?? "",
      notes: r.notes ?? "",
      checked: false,
      alsoBack: false,
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const base = {
      called_as: txt(form.called_as),
      board_note: txt(form.board_note),
      fare_min_ghs: num(form.fare_min),
      fare_max_ghs: num(form.fare_max),
      minutes: num(form.minutes),
      runs: txt(form.runs),
      notes: txt(form.notes),
      ...(form.checked ? { checked_on: today() } : {}),
    };
    const row = { ...base, from_station_id: form.from, to_station_id: form.to };
    let error;
    if (editing) {
      ({ error } = await supabase.from("trotro_routes").update(row).eq("id", editing.id));
    } else {
      /*
       * The way back as its own row, and only when asked. Trotros do not
       * always run the same road home, so the return is never assumed; this
       * is a shortcut for the common case where somebody has ridden both.
       * Where it boards is left blank, because the other end loads somewhere
       * else.
       */
      const rows = [row];
      if (form.alsoBack) {
        rows.push({ ...base, board_note: null, from_station_id: form.to, to_station_id: form.from });
      }
      ({ error } = await supabase.from("trotro_routes").insert(rows));
    }
    setBusy(false);
    if (error) return setError(error.message);
    setForm(blank);
    setEditing(null);
    say("Route saved");
    router.refresh();
  }

  async function toggle(r: TrotroRoute) {
    await supabase.from("trotro_routes").update({ is_active: !r.is_active }).eq("id", r.id);
    router.refresh();
  }

  async function remove(r: TrotroRoute) {
    if (!confirm("Delete this route?")) return;
    await supabase.from("trotro_routes").delete().eq("id", r.id);
    router.refresh();
  }

  if (stations.length < 2) {
    return <div className="card p-5 text-[14px] text-mutedbrown">Add at least two stations first.</div>;
  }

  const stationSelect = (value: string, onChange: (v: string) => void) => (
    <select className="inp h-[42px]" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose…</option>
      {stations.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div className="card grid gap-3 p-5 md:grid-cols-3">
        <div>
          <span className="flbl">From</span>
          {stationSelect(form.from, (from) => setForm({ ...form, from }))}
        </div>
        <div>
          <span className="flbl">To</span>
          {stationSelect(form.to, (to) => setForm({ ...form, to }))}
        </div>
        <div>
          <span className="flbl">What the mate calls out</span>
          <input className="inp h-[42px]" value={form.called_as} placeholder="Madina! Madina!" onChange={(e) => setForm({ ...form, called_as: e.target.value })} />
        </div>
        <div>
          <span className="flbl">Fare from (GHS)</span>
          <input className="inp h-[42px] font-mono" inputMode="decimal" value={form.fare_min} onChange={(e) => setForm({ ...form, fare_min: e.target.value })} />
        </div>
        <div>
          <span className="flbl">Fare to (GHS)</span>
          <input className="inp h-[42px] font-mono" inputMode="decimal" value={form.fare_max} placeholder="same if fixed" onChange={(e) => setForm({ ...form, fare_max: e.target.value })} />
        </div>
        <div>
          <span className="flbl">Minutes, usually</span>
          <input className="inp h-[42px] font-mono" inputMode="numeric" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <span className="flbl">Where it loads in the station</span>
          <input className="inp h-[42px]" value={form.board_note} placeholder="Front row, by the footbridge" onChange={(e) => setForm({ ...form, board_note: e.target.value })} />
        </div>
        <div>
          <span className="flbl">When it runs</span>
          <input className="inp h-[42px]" value={form.runs} placeholder="5am to 10pm, every few minutes" onChange={(e) => setForm({ ...form, runs: e.target.value })} />
        </div>
        <div className="md:col-span-3">
          <span className="flbl">Anything else</span>
          <input className="inp h-[42px]" value={form.notes} placeholder="Traffic from 4pm doubles the time" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <Checked on={form.checked} date={editing?.checked_on ?? null} onChange={(checked) => setForm({ ...form, checked })} />
        {!editing ? (
          <label className="flex items-center gap-2 pb-2 text-[14px]">
            <input type="checkbox" checked={form.alsoBack} onChange={(e) => setForm({ ...form, alsoBack: e.target.checked })} />
            I have ridden it back too
          </label>
        ) : (
          <div />
        )}
        <div className="flex items-end gap-2">
          <button className="btn btnsm px-7" onClick={save} disabled={busy || !form.from || !form.to || form.from === form.to}>
            {editing ? "Update route" : "Add route"}
          </button>
          {editing && (
            <button className="btn2 btnsm" onClick={() => (setEditing(null), setForm(blank))}>
              Cancel
            </button>
          )}
        </div>
        {error && <div className="why not-italic text-staletext md:col-span-3">{error}</div>}
      </div>

      <table className="tbl mt-6 w-full">
        <thead>
          <tr>
            <th>Ride</th>
            <th>Called</th>
            <th>Fare</th>
            <th>Time</th>
            <th>Checked</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {routes.map((r) => (
            <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
              <td className="font-bold">
                {name.get(r.from_station_id) ?? "?"} → {name.get(r.to_station_id) ?? "?"}
              </td>
              <td className="text-[13px]">{r.called_as ?? "–"}</td>
              <td className="font-mono">{fareText(r.fare_min_ghs, r.fare_max_ghs) ?? <span className="text-staletext">unknown</span>}</td>
              <td className="font-mono">{r.minutes ? `${r.minutes} min` : "–"}</td>
              <td>
                <CheckedBadge date={r.checked_on} />
              </td>
              <td className="whitespace-nowrap">
                <button className="font-semibold text-flame" onClick={() => edit(r)}>
                  Edit
                </button>
                <button className="ml-3 font-semibold text-mutedbrown" onClick={() => toggle(r)}>
                  {r.is_active ? "Hide" : "Show"}
                </button>
                <button className="ml-3 font-semibold text-staletext" onClick={() => remove(r)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {!routes.length && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-mutedbrown">
                No routes yet. One row is one direct ride, as you took it.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

/* ── venue directions ─────────────────────────────────────────────────── */

function VenueDirections({ venues, access, stations, areas, say }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const byVenue = useMemo(() => new Map(access.map((a) => [a.venue_id, a])), [access]);
  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas]);
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const shown = venues.filter((v) => {
    const a = byVenue.get(v.id);
    if (onlyMissing && a?.landmark) return false;
    const q = query.trim().toLowerCase();
    return !q || v.name.toLowerCase().includes(q) || (areaName.get(v.area_id) ?? "").toLowerCase().includes(q);
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <input className="inp h-[42px] max-w-[320px]" placeholder="Search venues or areas" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Only those with no landmark
        </label>
      </div>

      <div className="mt-4 grid gap-2">
        {shown.map((v) => {
          const a = byVenue.get(v.id);
          return (
            <div key={v.id} className="card p-4">
              <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(open === v.id ? null : v.id)}>
                <span>
                  <b>{v.name}</b> <span className="text-[13px] text-mutedbrown">· {areaName.get(v.area_id) ?? ""}</span>
                  {a?.landmark ? <div className="text-[13px]">Tell the driver: {a.landmark}</div> : <div className="text-[13px] text-staletext">No landmark yet</div>}
                </span>
                <CheckedBadge date={a?.checked_on ?? null} />
              </button>
              {open === v.id && (
                <AccessForm
                  venue={v}
                  current={a ?? null}
                  stations={stations}
                  onSaved={() => {
                    setOpen(null);
                    say("Directions saved");
                    router.refresh();
                  }}
                  supabase={supabase}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function AccessForm({
  venue,
  current,
  stations,
  onSaved,
  supabase,
}: {
  venue: AccessVenue;
  current: VenueAccess | null;
  stations: TrotroStation[];
  onSaved: () => void;
  supabase: ReturnType<typeof createClient>;
}) {
  const [f, setF] = useState({
    landmark: current?.landmark ?? "",
    station_id: current?.station_id ?? "",
    drop_point: current?.drop_point ?? "",
    walk_minutes: current?.walk_minutes == null ? "" : String(current.walk_minutes),
    walk_directions: current?.walk_directions ?? "",
    checked: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("venue_access").upsert({
      venue_id: venue.id,
      landmark: txt(f.landmark),
      station_id: f.station_id || null,
      drop_point: txt(f.drop_point),
      walk_minutes: num(f.walk_minutes),
      walk_directions: txt(f.walk_directions),
      updated_at: new Date().toISOString(),
      ...(f.checked ? { checked_on: today() } : {}),
    });
    setBusy(false);
    if (error) return setError(error.message);
    onSaved();
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-black/10 pt-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <span className="flbl">What to tell a taxi or Bolt driver</span>
        <input className="inp h-[42px]" maxLength={200} value={f.landmark} placeholder="Oxford Street, opposite Koala" onChange={(e) => setF({ ...f, landmark: e.target.value })} />
        <span className="mt-1.5 block text-[12px] text-mutedbrown">
          A landmark a driver knows, not a street number.{venue.lat == null ? " This venue has no map pin, so ride apps will need this." : ""}
        </span>
      </div>
      <div>
        <span className="flbl">Trotro: get off at</span>
        <select className="inp h-[42px]" value={f.station_id} onChange={(e) => setF({ ...f, station_id: e.target.value })}>
          <option value="">No trotro directions</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="flbl">What to say to the mate</span>
        <input className="inp h-[42px]" maxLength={200} value={f.drop_point} placeholder='"Bus stop" at the Danquah Circle' onChange={(e) => setF({ ...f, drop_point: e.target.value })} />
      </div>
      <div>
        <span className="flbl">Walk from there (minutes)</span>
        <input className="inp h-[42px] font-mono" inputMode="numeric" value={f.walk_minutes} onChange={(e) => setF({ ...f, walk_minutes: e.target.value })} />
      </div>
      <Checked on={f.checked} date={current?.checked_on ?? null} onChange={(checked) => setF({ ...f, checked })} />
      <div className="md:col-span-2">
        <span className="flbl">The walk</span>
        <textarea className="inp min-h-[56px] py-2" maxLength={400} value={f.walk_directions} placeholder="Cross at the lights, second left, it is above the pharmacy" onChange={(e) => setF({ ...f, walk_directions: e.target.value })} />
      </div>
      <div className="md:col-span-2">
        <button className="btn btnsm px-7" onClick={save} disabled={busy}>
          Save directions
        </button>
        <Link href={`/getting-there?venue=${venue.id}`} target="_blank" className="ml-4 text-[14px] font-semibold text-flame">
          Preview ↗
        </Link>
      </div>
      {error && <div className="why not-italic text-staletext md:col-span-2">{error}</div>}
    </div>
  );
}

/* ── car rentals ──────────────────────────────────────────────────────── */

function Rentals({ rentals, say }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const blank = {
    name: "",
    phone: "",
    whatsapp_phone: "",
    website: "",
    with_driver: true,
    self_drive: false,
    day_min: "",
    day_max: "",
    areas_served: "",
    notes: "",
    checked: false,
  };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<CarRental | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(r: CarRental) {
    setEditing(r);
    setForm({
      name: r.name,
      phone: r.phone ?? "",
      whatsapp_phone: r.whatsapp_phone ?? "",
      website: r.website ?? "",
      with_driver: r.with_driver,
      self_drive: r.self_drive,
      day_min: r.day_rate_min_ghs == null ? "" : String(r.day_rate_min_ghs),
      day_max: r.day_rate_max_ghs == null ? "" : String(r.day_rate_max_ghs),
      areas_served: r.areas_served ?? "",
      notes: r.notes ?? "",
      checked: false,
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const row = {
      name: form.name.trim(),
      phone: txt(form.phone),
      whatsapp_phone: txt(form.whatsapp_phone),
      website: txt(form.website),
      with_driver: form.with_driver,
      self_drive: form.self_drive,
      day_rate_min_ghs: num(form.day_min),
      day_rate_max_ghs: num(form.day_max),
      areas_served: txt(form.areas_served),
      notes: txt(form.notes),
      ...(form.checked ? { checked_on: today() } : {}),
    };
    const { error } = editing
      ? await supabase.from("car_rentals").update(row).eq("id", editing.id)
      : await supabase.from("car_rentals").insert(row);
    setBusy(false);
    if (error) return setError(error.message);
    setForm(blank);
    setEditing(null);
    say("Saved");
    router.refresh();
  }

  async function toggle(r: CarRental) {
    await supabase.from("car_rentals").update({ is_active: !r.is_active }).eq("id", r.id);
    router.refresh();
  }

  async function remove(r: CarRental) {
    if (!confirm(`Delete ${r.name}?`)) return;
    await supabase.from("car_rentals").delete().eq("id", r.id);
    router.refresh();
  }

  const field = (label: string, key: keyof typeof form, placeholder = "", mono = false) => (
    <div>
      <span className="flbl">{label}</span>
      <input
        className={`inp h-[42px] ${mono ? "font-mono" : ""}`}
        value={String(form[key])}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <>
      <div className="card grid gap-3 p-5 md:grid-cols-3">
        {field("Company", "name")}
        {field("Phone", "phone", "+233 ...", true)}
        {field("WhatsApp", "whatsapp_phone", "+233 ...", true)}
        {field("Website", "website", "https://...")}
        {field("Day rate from (GHS)", "day_min", "", true)}
        {field("Day rate to (GHS)", "day_max", "", true)}
        <div className="flex items-end gap-5">
          <label className="flex items-center gap-2 pb-2 text-[14px]">
            <input type="checkbox" checked={form.with_driver} onChange={(e) => setForm({ ...form, with_driver: e.target.checked })} />
            With a driver
          </label>
          <label className="flex items-center gap-2 pb-2 text-[14px]">
            <input type="checkbox" checked={form.self_drive} onChange={(e) => setForm({ ...form, self_drive: e.target.checked })} />
            Self-drive
          </label>
        </div>
        {field("Where they go", "areas_served", "Accra and Tema; Kumasi on request")}
        <Checked on={form.checked} date={editing?.checked_on ?? null} onChange={(checked) => setForm({ ...form, checked })} />
        <div className="md:col-span-3">{field("Notes", "notes", "Fuel included? Airport pickup? Deposit?")}</div>
        <div className="flex items-end gap-2 md:col-span-3">
          <button className="btn btnsm px-7" onClick={save} disabled={busy || form.name.trim().length < 2}>
            {editing ? "Update" : "Add company"}
          </button>
          {editing && (
            <button className="btn2 btnsm" onClick={() => (setEditing(null), setForm(blank))}>
              Cancel
            </button>
          )}
        </div>
        {error && <div className="why not-italic text-staletext md:col-span-3">{error}</div>}
      </div>

      <table className="tbl mt-6 w-full">
        <thead>
          <tr>
            <th>Company</th>
            <th>Kind</th>
            <th>Per day</th>
            <th>Checked</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rentals.map((r) => (
            <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
              <td className="font-bold">{r.name}</td>
              <td className="text-[13px]">{[r.with_driver && "with driver", r.self_drive && "self-drive"].filter(Boolean).join(", ") || "–"}</td>
              <td className="font-mono">{fareText(r.day_rate_min_ghs, r.day_rate_max_ghs) ?? "–"}</td>
              <td>
                <CheckedBadge date={r.checked_on} />
              </td>
              <td className="whitespace-nowrap">
                <button className="font-semibold text-flame" onClick={() => edit(r)}>
                  Edit
                </button>
                <button className="ml-3 font-semibold text-mutedbrown" onClick={() => toggle(r)}>
                  {r.is_active ? "Hide" : "Show"}
                </button>
                <button className="ml-3 font-semibold text-staletext" onClick={() => remove(r)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {!rentals.length && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-mutedbrown">
                No rental companies yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
