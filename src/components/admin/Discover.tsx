"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/Toast";
import type { Area } from "@/lib/types";

/**
 * Find venues in an area and add them in bulk.
 *
 * The bottleneck in the catalogue was never typing, it was knowing what to
 * type. This asks Google what is actually in a neighbourhood so the work
 * becomes triage: tick the places that belong, skip the ones that don't.
 *
 * What gets added is deliberately a stub, no price, no menu, no vibe tags,
 * because Google knows a place exists but not what an evening there costs.
 * Everything added lands in the unpriced queue, which is the list of venues to
 * go and find menus for.
 */
/** Towns worth searching beyond the two cities, offered as suggestions; any name works. */
const TOWNS = [
  "Accra",
  "Kumasi",
  "Takoradi",
  "Cape Coast",
  "Elmina",
  "Tamale",
  "Ho",
  "Koforidua",
  "Sunyani",
  "Kasoa",
  "Winneba",
  "Ada",
  "Akosombo",
  "Obuasi",
  "Techiman",
  "Bolgatanga",
  "Wa",
];

const KINDS = [
  "restaurants",
  "bars",
  "cafes",
  "lounges",
  "dessert shops",
  "things to do",
  "parks",
  "art galleries",
  "bowling",
  "padel courts",
];

interface Result {
  id: string;
  name: string;
  address: string;
  businessStatus: string | null;
  primaryType: string | null;
  types: string[];
  lat: number | null;
  lng: number | null;
  priceLevel: string | null;
  rating: number | null;
  ratingCount: number | null;
  /** The neighbourhood it will be filed under, from its address. */
  area: string | null;
  /** Whether that area already exists, or will be created. */
  areaKnown: boolean;
  already: boolean;
}

export function Discover({
  areas,
  initial,
}: {
  areas: Area[];
  /** A search to start with, from a link: the demand page sends the gap it found. */
  initial?: { area?: string; what?: string };
}) {
  const router = useRouter();
  const [what, setWhat] = useState(KINDS.find((k) => k === initial?.what) ?? KINDS[0]);
  const startArea = areas.find((a) => a.name === initial?.area);
  const [city, setCity] = useState(startArea?.city || "Accra");
  // Optional: blank searches the whole town.
  const [area, setArea] = useState(startArea?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [neighbourhoods, setNeighbourhoods] = useState<{ name: string; count: number }[]>([]);
  const cities = [...new Set([...areas.map((a) => a.city || "Accra"), ...TOWNS])];
  const areasHere = areas.filter((a) => (a.city || "Accra").toLowerCase() === city.trim().toLowerCase());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  async function post(body: unknown) {
    const res = await fetch("/api/admin/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Request failed.");
    return json;
  }

  async function search(inArea = area) {
    if (city.trim().length < 2) return setError("Pick a city or town first.");
    setBusy(true);
    setError(null);
    setResults(null);
    setPicked(new Set());
    try {
      const json = await post({ action: "search", what, city: city.trim(), area: inArea.trim() });
      setResults(json.results as Result[]);
      // Kept from the whole-town search, so the chips stay while you look closer.
      if (!inArea.trim()) setNeighbourhoods(json.neighbourhoods ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /*
   * Arriving from "What to add next" with both named, the search is the
   * whole reason for the visit, so it runs rather than waiting for a tap.
   * Once: a ref, because development renders effects twice.
   */
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !initial?.area || !initial?.what) return;
    started.current = true;
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add() {
    const chosen = (results ?? []).filter((r) => picked.has(r.id));
    if (!chosen.length) return;

    setBusy(true);
    setError(null);
    try {
      const json = await post({
        action: "add",
        city: city.trim(),
        area: area.trim(),
        places: chosen.map((r) => ({
          area: r.area,
          id: r.id,
          name: r.name,
          address: r.address,
          lat: r.lat,
          lng: r.lng,
          priceLevel: r.priceLevel,
          primaryType: r.primaryType,
          types: r.types,
        })),
      });

      setToast(
        `Added ${json.added} venue(s)${json.skipped ? `, skipped ${json.skipped} already held` : ""}${json.areasCreated ? `, ${json.areasCreated} new area(s)` : ""}. They stay hidden until their menu goes in.`
      );
      // Reflect what is now held, without a second round trip.
      setResults((cur) =>
        (cur ?? []).map((r) => (picked.has(r.id) ? { ...r, already: true } : r))
      );
      setPicked(new Set());
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const addable = (results ?? []).filter((r) => !r.already);

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Discover venues</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        Pick a city or town anywhere in Ghana. Leave the area blank to search the whole place: each result
        shows the neighbourhood it will be filed under, and the neighbourhoods found appear as chips to look
        closer. Added venues stay hidden from the app until their menu goes in.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col">
          <span className="flbl">What</span>
          <select className="inp" value={what} onChange={(e) => setWhat(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col">
          <span className="flbl">City or town</span>
          <input
            className="inp"
            list="admin-city-list"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setArea("");
              setNeighbourhoods([]);
            }}
            placeholder="Kumasi"
          />
          <datalist id="admin-city-list">
            {cities.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col">
          <span className="flbl">Area, optional</span>
          <input
            className="inp"
            list="admin-area-list"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Whole town"
          />
          <datalist id="admin-area-list">
            {areasHere.map((a) => (
              <option key={a.id} value={a.name} />
            ))}
          </datalist>
        </label>

        <button type="button" className="btn btnsm" disabled={busy} onClick={() => void search()}>
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      {neighbourhoods.length ? (
        <div className="mt-4">
          <div className="text-[13px] text-mutedbrown">Neighbourhoods found in {city}, tap one to look closer:</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {area ? (
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setArea("");
                  void search("");
                }}
              >
                ← All of {city}
              </button>
            ) : null}
            {neighbourhoods.map((n) => (
              <button
                key={n.name}
                type="button"
                className={`chip ${area === n.name ? "chip-on" : ""}`}
                onClick={() => {
                  setArea(n.name);
                  void search(n.name);
                }}
              >
                {n.name} · {n.count}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-[13px] text-staletext">{error}</p> : null}

      {results ? (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[14px] text-mutedbrown">
              {results.length} found · {addable.length} new · {picked.size} selected
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn2 btnsm"
                onClick={() => setPicked(new Set(addable.map((r) => r.id)))}
              >
                Select all new
              </button>
              <button
                type="button"
                className="btn btnsm"
                disabled={busy || !picked.size}
                onClick={add}
              >
                Add {picked.size || ""} to catalogue
              </button>
            </div>
          </div>

          <ul className="mt-3 space-y-2">
            {results.map((r) => {
              const shut =
                r.businessStatus === "CLOSED_PERMANENTLY" ||
                r.businessStatus === "CLOSED_TEMPORARILY";
              const on = picked.has(r.id);

              return (
                <li key={r.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-bar border p-3 text-ink transition ${
                      r.already
                        ? "border-line bg-sand/50 opacity-70"
                        : on
                          ? "border-flame bg-shell ring-1 ring-flame/30"
                          : "border-line bg-shell hover:border-mutedbrown"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={r.already || shut}
                      checked={on}
                      onChange={(e) => {
                        setPicked((cur) => {
                          const next = new Set(cur);
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          return next;
                        });
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[14px] font-semibold text-ink">{r.name}</span>
                        {r.primaryType ? (
                          <span className="rounded-md bg-sand px-1.5 text-[11px] text-mutedbrown">
                            {r.primaryType.replace(/_/g, " ")}
                          </span>
                        ) : null}
                        {r.rating ? (
                          <span className="text-[12px] text-mutedbrown">
                            ★ {r.rating} ({r.ratingCount ?? 0})
                          </span>
                        ) : null}
                        {r.priceLevel ? (
                          <span className="text-[12px] text-mutedbrown">
                            {r.priceLevel.replace("PRICE_LEVEL_", "").toLowerCase()}
                          </span>
                        ) : null}
                        {r.already ? (
                          <span className="rounded-full bg-sand px-1.5 text-[11px] text-ink">
                            already have it
                          </span>
                        ) : null}
                        {shut ? (
                          <span className="rounded-full bg-staletext px-1.5 text-[11px] text-white">
                            closed
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[13px] text-mutedbrown">{r.address}</div>
                      {r.area && !r.already ? (
                        <div className="mt-1 text-[12.5px] text-cocoa">
                          Files under <b>{r.area}</b>
                          {r.areaKnown ? "" : " (new area)"}
                        </div>
                      ) : null}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {toast && <Toast message={toast} />}
    </div>
  );
}
