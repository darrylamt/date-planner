"use client";

import Link from "next/link";
import { useState } from "react";
import { STAY_KINDS } from "@/lib/stays";

export interface FinderDestination {
  slug: string;
  name: string;
  region: string;
}

interface Found {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
  rating: number | null;
  ratingCount: number | null;
  phone: string | null;
  website: string | null;
  googleMapsUri: string | null;
  addressParts: string[];
  localities: string[];
  km: number;
  kind: string;
  /** The stay's id when we already hold it. */
  have: string | null;
}

const kindLabel = (id: string) => STAY_KINDS.find((k) => k.id === id)?.label ?? "Stay";
/** A Ghanaian number as wa.me wants it: +233 24 … or 024 … becomes 23324…. */
const waNumber = (n: string) => {
  const d = n.replace(/\D/g, "");
  return d.startsWith("0") ? `233${d.slice(1)}` : d;
};

/**
 * The stay finder (0099, 0101): every hotel, guesthouse, lodge and resort
 * Google lists near a Trips destination, with phone, website, rating and
 * Maps link, so a town is triaged in one sitting. Tick the ones worth having
 * and Add makes them stays with their kind, region, town and contacts filled
 * in; each then needs its rooms, rates and photos. Ask for rates opens
 * WhatsApp with the question already written, for the ones that use it.
 */
export function StayFinder({ destinations, initial }: { destinations: FinderDestination[]; initial: string }) {
  const [dest, setDest] = useState(initial || destinations[0]?.slug || "");
  const [found, setFound] = useState<Found[] | null>(null);
  const [reach, setReach] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);
  const place = destinations.find((d) => d.slug === dest);

  async function post(body: unknown) {
    const res = await fetch("/api/admin/stays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "That did not work.");
    return json;
  }

  async function find() {
    setBusy(true);
    setError(null);
    setAdded([]);
    try {
      const json = await post({ action: "find", destination: dest });
      const rows = json.results as Found[];
      setFound(rows);
      setReach(json.reachKm as number);
      // The well-reviewed ones we do not hold yet, ticked to start with.
      setPicked(new Set(rows.filter((r) => !r.have && (r.ratingCount ?? 0) >= 5).map((r) => r.id)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addPicked() {
    if (!found) return;
    setBusy(true);
    setError(null);
    try {
      const places = found.filter((r) => picked.has(r.id) && !r.have);
      const json = await post({ action: "import", destination: dest, places });
      const made = json.added as { id: string; name: string }[];
      setAdded(made);
      if ((json.failures as string[]).length) setError((json.failures as string[]).join(" · "));
      const ids = new Map(made.map((m) => [m.name, m.id]));
      setFound(found.map((r) => (ids.has(r.name) ? { ...r, have: ids.get(r.name)! } : r)));
      setPicked(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ask = (r: Found) =>
    `https://wa.me/${waNumber(r.phone!)}?text=${encodeURIComponent(
      `Hello ${r.name}, this is Duro!, the trip planner. We'd like to list you for people planning trips to ${place?.name ?? "your area"}. What are your room types and nightly rates, and how many does each sleep? Is breakfast included?`
    )}`;

  const fresh = found?.filter((r) => !r.have) ?? [];

  return (
    <div className="max-w-[1100px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1>Find stays</h1>
        <Link href="/admin/stays" className="text-[13px] font-semibold text-cocoa hover:text-ink">
          ← All stays
        </Link>
      </div>
      <p className="mt-1 max-w-[760px] text-[14px] text-mutedbrown">
        Every place to stay Google lists near a destination, with its phone, website and rating. Tick the ones worth having and add
        them: kind, region, town and contacts are filled in, so each needs only its rooms, rates and photos. Rates never come from
        here: ask the place.
      </p>

      <div className="card mt-5 flex flex-wrap items-end gap-3 p-5">
        <label className="min-w-[240px] flex-1">
          <span className="flbl">Near</span>
          <select className="inp h-[42px]" value={dest} onChange={(e) => (setDest(e.target.value), setFound(null), setAdded([]))}>
            {destinations.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name} · {d.region}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" disabled={busy || !dest} onClick={() => void find()}>
          {busy && !found ? "Looking…" : "Find places to stay"}
        </button>
      </div>

      {error ? <div className="mt-3 text-[13px] text-staletext">{error}</div> : null}

      {added.length ? (
        <div className="card mt-4 p-4 text-[14px]">
          <b>Added {added.length}.</b> Each needs its rooms and rates, and photos:
          <div className="mt-2 flex flex-wrap gap-2">
            {added.map((a) => (
              <Link key={a.id} href={`/admin/stays/${a.id}`} className="btn2 btnsm">
                {a.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {found ? (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[14px] text-mutedbrown">
              {found.length} within {reach} km of {place?.name}: {fresh.length} new, {found.length - fresh.length} already in.
            </span>
            <span className="flex gap-2">
              <button type="button" className="btn2 btnsm" onClick={() => setPicked(new Set(fresh.map((r) => r.id)))}>
                Tick all new
              </button>
              <button type="button" className="btn2 btnsm" disabled={!picked.size} onClick={() => setPicked(new Set())}>
                Untick all
              </button>
              <button type="button" className="btn btnsm" disabled={busy || !picked.size} onClick={() => void addPicked()}>
                {busy ? "Adding…" : `Add ${picked.size} as stays`}
              </button>
            </span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="tbl w-full">
              <thead>
                <tr>
                  <th></th>
                  <th>Place</th>
                  <th>Rated</th>
                  <th>Reach them</th>
                  <th>Away</th>
                </tr>
              </thead>
              <tbody>
                {found.map((r) => (
                  <tr key={r.id} className={r.have ? "opacity-60" : ""}>
                    <td>
                      {r.have ? null : (
                        <input
                          type="checkbox"
                          aria-label={`Add ${r.name}`}
                          checked={picked.has(r.id)}
                          onChange={(e) => {
                            const next = new Set(picked);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            setPicked(next);
                          }}
                        />
                      )}
                    </td>
                    <td>
                      <span className="block font-semibold">
                        {r.have ? (
                          <Link href={`/admin/stays/${r.have}`} className="text-flame">
                            {r.name}
                          </Link>
                        ) : (
                          r.name
                        )}
                      </span>
                      <span className="block text-[12.5px] text-mutedbrown">
                        {kindLabel(r.kind)} · {r.address}
                        {r.have ? " · already a stay" : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-[13px]">{r.rating ? `${r.rating.toFixed(1)} (${r.ratingCount ?? 0})` : "–"}</td>
                    <td className="text-[13px]">
                      <span className="flex flex-wrap gap-x-3 gap-y-1">
                        {r.phone ? <a href={`tel:${r.phone.replace(/\s/g, "")}`}>{r.phone}</a> : <span className="text-staletext">no phone</span>}
                        {r.phone ? (
                          <a href={ask(r)} target="_blank" rel="noreferrer" className="font-semibold text-flame">
                            Ask for rates
                          </a>
                        ) : null}
                        {r.website ? (
                          <a href={r.website} target="_blank" rel="noreferrer" className="font-semibold text-flame">
                            Website
                          </a>
                        ) : null}
                        {r.googleMapsUri ? (
                          <a href={r.googleMapsUri} target="_blank" rel="noreferrer" className="font-semibold text-flame">
                            Maps
                          </a>
                        ) : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap font-mono text-[13px]">{r.km} km</td>
                  </tr>
                ))}
                {!found.length ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-mutedbrown">
                      Google lists no places to stay near {place?.name}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
