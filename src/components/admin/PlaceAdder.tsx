"use client";

import { useState } from "react";
import type { PlaceSummary } from "@/lib/places";
import type { PlacedVenue } from "@/lib/venueFromPlace";

/**
 * "Not one of ours? Add it from Google", inside another form (an event's
 * venue). Search Google, pick the place, and it becomes one of our venues in
 * one step (/api/admin/venues/from-place), with its area worked out the way
 * the venue form does. A place we already hold comes back as it is.
 */
export function PlaceAdder({ onAdded }: { onAdded: (v: PlacedVenue) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "That did not work.");
    return json;
  }

  async function search() {
    if (query.trim().length < 2) return setError("Type the place's name first.");
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const json = await post("/api/admin/places", { action: "search", query: query.trim() });
      setResults(json.results as PlaceSummary[]);
      if (!json.results.length) setError("Google has no match in Ghana. Try adding the town, like “Skybar Accra”.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function add(placeId: string) {
    setBusy(true);
    setError(null);
    try {
      const json = await post("/api/admin/venues/from-place", { placeId });
      onAdded(json.venue as PlacedVenue);
      setOpen(false);
      setResults(null);
      setQuery("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="mt-1 text-[13px] font-semibold text-flame hover:text-flame-dark" onClick={() => setOpen(true)}>
        Not one of ours? Add it from Google
      </button>
    );
  }

  return (
    <div className="mt-2 grid gap-2 rounded-bar border border-line bg-cream/60 p-3">
      <div className="flex gap-2">
        <input
          className="inp h-[38px] flex-1"
          placeholder="The place's name, and the town if it helps"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <button type="button" className="btn2 btnsm" disabled={busy} onClick={() => void search()}>
          {busy ? "Looking…" : "Search Google"}
        </button>
        <button type="button" className="btn2 btnsm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {error ? <div className="text-[13px] text-staletext">{error}</div> : null}
      {results?.length ? (
        <ul className="grid gap-1">
          {results.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-[8px] bg-white px-3 py-2 text-[13px]">
              <span className="min-w-0">
                <span className="font-semibold">{r.name}</span>
                <span className="block truncate text-mutedbrown">{r.address}</span>
              </span>
              <button type="button" className="btn btnsm shrink-0" disabled={busy} onClick={() => void add(r.id)}>
                Add and use
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
