"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fold } from "@/lib/fold";
import { TRAVEL_MODES, tripFareText, type IntercityRoute, type TravelMode } from "@/lib/trips";

const today = () => new Date().toISOString().slice(0, 10);
const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
const txt = (s: string) => s.trim() || null;
const modeLabel = (m: string) => TRAVEL_MODES.find((x) => x.id === m)?.label ?? m;

const blank = {
  from_town: "Accra",
  to_town: "",
  mode: "bus" as TravelMode,
  operator: "",
  service: "",
  both_ways: true,
  from_station: "",
  to_station: "",
  departures: "",
  duration_mins: "",
  fare_min: "",
  fare_max: "",
  book_url: "",
  book_phone: "",
  source_url: "",
  notes: "",
  checked_on: "",
};
type Form = typeof blank;

/**
 * Every way between two towns for Trips (0101): one row is one operator's
 * service, a bus class or an airline. A fare goes in only as somebody read
 * it or was told it, with the date and where from; a fare nobody knows is
 * left blank, and the app says so rather than guessing.
 */
export function IntercityRoutes({ routes, towns, initialTown }: { routes: IntercityRoute[]; towns: string[]; initialTown: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<IntercityRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [town, setTown] = useState(initialTown);
  const [mode, setMode] = useState<"" | TravelMode>("");
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const operators = useMemo(() => [...new Set(routes.map((r) => r.operator))].sort(), [routes]);

  const shown = useMemo(() => {
    const t = fold(town.trim());
    return routes.filter((r) => (!mode || r.mode === mode) && (!t || fold(r.to_town).includes(t) || fold(r.from_town).includes(t) || fold(r.operator).includes(t)));
  }, [routes, town, mode]);

  async function post(body: unknown) {
    const res = await fetch("/api/admin/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "That did not work.");
    return json;
  }

  function edit(r: IntercityRoute) {
    setEditing(r);
    setError(null);
    const s = (x: unknown) => (x == null ? "" : String(x));
    setForm({
      from_town: r.from_town,
      to_town: r.to_town,
      mode: r.mode,
      operator: r.operator,
      service: r.service,
      both_ways: r.both_ways,
      from_station: s(r.from_station),
      to_station: s(r.to_station),
      departures: s(r.departures),
      duration_mins: s(r.duration_mins),
      fare_min: s(r.fare_min_ghs),
      fare_max: s(r.fare_max_ghs),
      book_url: s(r.book_url),
      book_phone: s(r.book_phone),
      source_url: s(r.source_url),
      notes: s(r.notes),
      checked_on: s(r.checked_on),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await post({
        action: "route",
        id: editing?.id ?? null,
        from_town: form.from_town.trim(),
        to_town: form.to_town.trim(),
        mode: form.mode,
        operator: form.operator.trim(),
        service: form.service.trim(),
        both_ways: form.both_ways,
        from_station: txt(form.from_station),
        to_station: txt(form.to_station),
        departures: txt(form.departures),
        duration_mins: num(form.duration_mins),
        fare_min_ghs: num(form.fare_min),
        fare_max_ghs: num(form.fare_max),
        book_url: txt(form.book_url),
        book_phone: txt(form.book_phone),
        source_url: txt(form.source_url),
        notes: txt(form.notes),
        checked_on: txt(form.checked_on),
      });
      setForm({ ...blank, from_town: form.from_town });
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(body: unknown) {
    try {
      await post(body);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const input = (label: string, key: keyof Form, props: { placeholder?: string; mono?: boolean; list?: string; span?: string; inputMode?: "decimal" | "numeric" } = {}) => (
    <label className={props.span}>
      <span className="flbl">{label}</span>
      <input
        className={`inp h-[42px] ${props.mono ? "font-mono" : ""}`}
        value={form[key] as string}
        placeholder={props.placeholder}
        list={props.list}
        inputMode={props.inputMode}
        onChange={(e) => set({ [key]: e.target.value } as Partial<Form>)}
      />
    </label>
  );

  return (
    <div className="max-w-[1100px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1>Ways to get there</h1>
        <Link href="/admin/trips" className="text-[13px] font-semibold text-cocoa hover:text-ink">
          ← Destinations
        </Link>
      </div>
      <p className="mt-1 max-w-[760px] text-[14px] text-mutedbrown">
        Buses, flights and trotros between towns. One row is one operator&apos;s service. A destination is reached through its
        &quot;arrive at&quot; town, so a bus to Hohoe serves Wli. Leave a fare blank when nobody knows it; put the lowest alone for a
        &quot;from&quot; fare.
      </p>

      <datalist id="trip-towns">
        {towns.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id="trip-operators">
        {operators.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <div className="card mt-5 grid gap-3 p-5 md:grid-cols-4">
        <h2 className="text-[16px] font-bold md:col-span-4">{editing ? `Change ${editing.operator} ${editing.from_town} → ${editing.to_town}` : "Add a way there"}</h2>
        {input("From", "from_town", { list: "trip-towns" })}
        {input("To", "to_town", { list: "trip-towns", placeholder: "Hohoe" })}
        <label>
          <span className="flbl">How</span>
          <select className="inp h-[42px]" value={form.mode} onChange={(e) => set({ mode: e.target.value as TravelMode })}>
            {TRAVEL_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {input("Operator", "operator", { list: "trip-operators", placeholder: "VIP Jeoun, STC, Africa World Airlines" })}
        {input("Service or class", "service", { placeholder: "Executive, Standard (blank if one kind)" })}
        {input("Fare from (GHS)", "fare_min", { mono: true, inputMode: "decimal" })}
        {input("Fare to (GHS)", "fare_max", { mono: true, inputMode: "decimal", placeholder: "same if fixed; blank for a \"from\" fare" })}
        {input("Journey, minutes", "duration_mins", { mono: true, inputMode: "numeric", placeholder: "270" })}
        {input("Leaves from", "from_station", { placeholder: "VIP station, Circle" })}
        {input("Arrives at", "to_station", { placeholder: "Asafo, Kumasi" })}
        {input("When it leaves", "departures", { placeholder: "6am, 9am, 1pm, or when full", span: "md:col-span-2" })}
        {input("Book online", "book_url", { placeholder: "https://…", span: "md:col-span-2" })}
        {input("Book by phone", "book_phone", { placeholder: "030 …" })}
        <label>
          <span className="flbl">Fare checked on</span>
          <span className="flex gap-2">
            <input type="date" className="inp h-[42px] flex-1" value={form.checked_on} onChange={(e) => set({ checked_on: e.target.value })} />
            <button type="button" className="btn2 btnsm" onClick={() => set({ checked_on: today() })}>
              Today
            </button>
          </span>
        </label>
        {input("Where the fare came from", "source_url", { placeholder: "The fare list, article or site", span: "md:col-span-2" })}
        {input("Anything else", "notes", { placeholder: "Book a day ahead in December", span: "md:col-span-2" })}
        <label className="flex items-center gap-2 text-[14px] md:col-span-2">
          <input type="checkbox" checked={form.both_ways} onChange={(e) => set({ both_ways: e.target.checked })} />
          The same service and fare the other way
        </label>
        <div className="flex items-end gap-2 md:col-span-2 md:justify-end">
          {editing ? (
            <button type="button" className="btn2 btnsm" onClick={() => (setEditing(null), setForm(blank), setError(null))}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="btn btnsm px-7"
            disabled={busy || form.from_town.trim().length < 2 || form.to_town.trim().length < 2 || form.operator.trim().length < 2}
            onClick={() => void save()}
          >
            {editing ? "Save changes" : "Add it"}
          </button>
        </div>
        {error ? <div className="text-[13px] text-staletext md:col-span-4">{error}</div> : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input className="inp h-[38px] max-w-[260px]" placeholder="Town or operator" value={town} onChange={(e) => setTown(e.target.value)} />
        {(["", ...TRAVEL_MODES.map((m) => m.id)] as ("" | TravelMode)[]).map((m) => (
          <button
            key={m || "all"}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${mode === m ? "bg-flame text-white" : "bg-white text-ink ring-1 ring-black/10"}`}
          >
            {m ? modeLabel(m) : "All"}
          </button>
        ))}
        <span className="text-[13px] text-mutedbrown">{shown.length} shown</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Between</th>
              <th>How</th>
              <th>Fare</th>
              <th>Checked</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
                <td className="font-bold">
                  {r.from_town} {r.both_ways ? "↔" : "→"} {r.to_town}
                </td>
                <td className="text-[13px]">
                  {r.operator}
                  {r.service ? ` · ${r.service}` : ""} <span className="text-mutedbrown">({modeLabel(r.mode)})</span>
                  {r.departures ? <span className="block text-mutedbrown">{r.departures}</span> : null}
                </td>
                <td className="whitespace-nowrap font-mono">
                  {tripFareText(r.fare_min_ghs, r.fare_max_ghs) ?? <span className="text-staletext">unknown</span>}
                </td>
                <td className="whitespace-nowrap">
                  {r.checked_on ? (
                    r.source_url ? (
                      <a href={r.source_url} target="_blank" rel="noreferrer" className="badge b-ok">
                        {r.checked_on}
                      </a>
                    ) : (
                      <span className="badge b-ok">{r.checked_on}</span>
                    )
                  ) : (
                    <span className="badge b-stale">not checked</span>
                  )}
                </td>
                <td className="whitespace-nowrap">
                  <button type="button" className="font-semibold text-flame" onClick={() => edit(r)}>
                    Edit
                  </button>
                  <button type="button" className="ml-3 font-semibold text-mutedbrown" onClick={() => void act({ action: "route_active", id: r.id, is_active: !r.is_active })}>
                    {r.is_active ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className="ml-3 font-semibold text-staletext"
                    onClick={() => confirm(`Delete ${r.operator} ${r.from_town} → ${r.to_town}?`) && void act({ action: "route_delete", id: r.id })}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!shown.length ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-mutedbrown">
                  Nothing matches.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
