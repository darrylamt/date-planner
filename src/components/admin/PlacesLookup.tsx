"use client";

import { useState } from "react";
import type { PlaceDetails, PlaceSummary } from "@/lib/places";

/**
 * Find a venue on Google and pull its facts in.
 *
 * This covers the tedious, error-prone half of a venue row, coordinates,
 * phone, address, whether it is still trading, from a source that cannot
 * invent them. The half Google has no opinion on (vibe tags, who it suits,
 * the menu) stays a human's job, which is a few clicks rather than research.
 *
 * Linking also stores the place id, which is what lets the nightly sweep ask
 * "is this still open?" without anyone remembering to wonder.
 */
export function PlacesLookup({
  initialName,
  linkedPlaceId,
  onApply,
}: {
  initialName: string;
  linkedPlaceId: string | null;
  onApply: (details: PlaceDetails) => void;
}) {
  const [query, setQuery] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PlaceSummary[] | null>(null);

  async function post(body: unknown) {
    const res = await fetch("/api/admin/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Lookup failed.");
    return json;
  }

  async function search() {
    if (query.trim().length < 2) {
      setError("Type a venue name first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const json = await post({ action: "search", query: query.trim() });
      const found = json.results as PlaceSummary[];
      setResults(found);
      if (!found.length) setError("Google has no match for that name in Accra.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function choose(placeId: string) {
    setBusy(true);
    setError(null);
    try {
      const json = await post({ action: "details", placeId });
      onApply(json.details as PlaceDetails);
      setResults(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-bar border border-line bg-cream/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[16px] font-bold">Find on Google</h2>
        {linkedPlaceId ? (
          <span className="text-[12px] text-mutedbrown">
            Linked, closures will be caught automatically
          </span>
        ) : (
          <span className="text-[12px] text-staletext">
            Not linked, nothing will notice if this place closes
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          className="inp"
          placeholder="Venue name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) {
              e.preventDefault();
              void search();
            }
          }}
        />
        <button type="button" className="btn btnsm" disabled={busy} onClick={search}>
          {busy ? "Looking…" : "Search"}
        </button>
      </div>

      {error ? <p className="mt-3 text-[13px] text-staletext">{error}</p> : null}

      {results?.length ? (
        <ul className="mt-3 space-y-2">
          {results.map((r) => {
            const shut =
              r.businessStatus === "CLOSED_PERMANENTLY" ||
              r.businessStatus === "CLOSED_TEMPORARILY";
            return (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => choose(r.id)}
                  className="w-full rounded-bar border border-line bg-white p-3 text-left transition hover:border-mutedbrown"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[14px] font-semibold">{r.name}</span>
                    {r.primaryType ? (
                      <span className="text-[12px] text-mutedbrown">
                        {r.primaryType.replace(/_/g, " ")}
                      </span>
                    ) : null}
                    {shut ? (
                      <span className="rounded-full bg-staletext px-1.5 text-[11px] text-white">
                        {r.businessStatus === "CLOSED_PERMANENTLY"
                          ? "closed"
                          : "temporarily closed"}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[13px] text-mutedbrown">{r.address}</div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
