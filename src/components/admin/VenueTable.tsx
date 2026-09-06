"use client";

import Link from "next/link";
import { useState } from "react";
import { ghs } from "@/lib/format";

interface Row {
  id: string;
  name: string;
  area: string;
  type: string;
  is_active: boolean;
  items: number;
  avgForTwo: number;
  staleDays: number | null;
  isStale: boolean;
  verification: string;
  verifiedAt: string | null;
  discrepancies: number;
}

interface VerifyResult {
  verdict: string;
  confidence: number;
  summary: string;
  discrepancies: string[];
  sources: { title: string; url: string }[];
  canonical_name: string | null;
  address: string | null;
  phone: string | null;
  instagram_handle: string | null;
}

/** Only a corroborated verdict reads as safe; everything else is a warning. */
function badgeClass(status: string): string {
  return status === "real" ? "badge b-ok" : "badge b-stale";
}

function badgeLabel(status: string): string {
  switch (status) {
    case "real":
      return "Verified";
    case "closed":
      return "Closed";
    case "not_found":
      return "Not found";
    case "uncertain":
      return "Uncertain";
    default:
      return "Unverified";
  }
}

export function VenueTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, VerifyResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = rows.filter((r) => {
    const matchesQuery =
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      r.area.toLowerCase().includes(q.toLowerCase());
    const matchesFilter = !onlyUnverified || (results[r.id]?.verdict ?? r.verification) !== "real";
    return matchesQuery && matchesFilter;
  });

  async function verify(id: string) {
    if (busyId) return; // one at a time — each call costs money and ~45s
    setBusyId(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch("/api/admin/verify-venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((e) => ({ ...e, [id]: data.error ?? "Verification failed." }));
        return;
      }
      setResults((r) => ({ ...r, [id]: data.verification }));
      setOpenId(id);
    } catch {
      setErrors((e) => ({ ...e, [id]: "Could not reach the verifier." }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          className="inp h-[42px] max-w-[280px]"
          placeholder="Search venues…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex cursor-pointer items-center gap-2 text-[14px] text-cocoa">
          <input
            type="checkbox"
            checked={onlyUnverified}
            onChange={(e) => setOnlyUnverified(e.target.checked)}
          />
          Only unverified
        </label>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="tbl w-full border-collapse">
          <thead>
            <tr>
              <th>Venue</th>
              <th>Area</th>
              <th>Type</th>
              <th>Items</th>
              <th>Avg price (2)</th>
              <th>Menu updated</th>
              <th>Status</th>
              <th>Verified</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const live = results[r.id];
              const status = live?.verdict ?? r.verification;
              const discrepancies = live ? live.discrepancies.length : r.discrepancies;
              const isOpen = openId === r.id && live;

              return (
                <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
                  <td className="font-bold">
                    {r.name}
                    {isOpen && (
                      <div className="mt-2 max-w-[520px] whitespace-normal rounded-xl bg-whybg p-3 text-[13px] font-normal leading-relaxed">
                        <div className="mb-1 font-semibold">
                          {live.canonical_name ?? r.name} — confidence {live.confidence}
                        </div>
                        <p className="text-cocoa">{live.summary}</p>

                        {(live.address || live.phone || live.instagram_handle) && (
                          <div className="mt-2 font-mono text-[12px] text-mutedbrown">
                            {live.address && <div>{live.address}</div>}
                            {live.phone && <div>{live.phone}</div>}
                            {live.instagram_handle && <div>{live.instagram_handle}</div>}
                          </div>
                        )}

                        {live.discrepancies.length > 0 && (
                          <ul className="mt-2 list-disc pl-4 text-staletext">
                            {live.discrepancies.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        )}

                        {live.sources.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {live.sources.slice(0, 5).map((s, i) => (
                              <a
                                key={i}
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-flame underline"
                              >
                                {new URL(s.url).hostname.replace("www.", "")}
                              </a>
                            ))}
                          </div>
                        )}

                        <button
                          className="mt-2 font-semibold text-flame"
                          onClick={() => setOpenId(null)}
                        >
                          Hide
                        </button>
                      </div>
                    )}
                    {errors[r.id] && (
                      <div className="mt-1 text-[13px] font-normal text-staletext">
                        {errors[r.id]}
                      </div>
                    )}
                  </td>
                  <td>{r.area}</td>
                  <td className="capitalize">{r.type}</td>
                  <td>{r.items}</td>
                  <td className="font-mono">{ghs(r.avgForTwo)}</td>
                  <td>
                    {r.staleDays === null
                      ? "never"
                      : r.staleDays === 0
                        ? "today"
                        : `${r.staleDays} days ago`}
                  </td>
                  <td>
                    {r.isStale ? (
                      <span className="badge b-stale">
                        Stale{r.staleDays !== null ? ` · ${r.staleDays}d` : ""}
                      </span>
                    ) : (
                      <span className="badge b-ok">Fresh</span>
                    )}
                  </td>
                  <td>
                    <span className={badgeClass(status)}>{badgeLabel(status)}</span>
                    {discrepancies > 0 && (
                      <div className="mt-1 text-[12px] text-staletext">
                        {discrepancies} discrepancy{discrepancies === 1 ? "" : "s"}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <button
                      className="font-semibold text-flame hover:text-flame-dark disabled:opacity-40"
                      onClick={() => verify(r.id)}
                      disabled={busyId !== null}
                      title="Search the web and check this venue is real"
                    >
                      {busyId === r.id ? "Checking…" : live ? "Re-check" : "Verify"}
                    </button>
                    {live && (
                      <button
                        className="ml-3 font-semibold text-cocoa hover:text-ink"
                        onClick={() => setOpenId(isOpen ? null : r.id)}
                      >
                        {isOpen ? "Hide" : "Details"}
                      </button>
                    )}
                    <Link
                      href={`/admin/venues/${r.id}`}
                      className="ml-3 font-semibold text-flame hover:text-flame-dark"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-mutedbrown">
                  No venues match {q ? `“${q}”` : "the current filter"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[13px] text-mutedbrown">
        Verifying searches the web and takes 40–60 seconds per venue. For a whole
        catalog run <code className="font-mono">npm run verify:catalog</code> instead —
        a browser request will time out long before it finishes.
      </p>
    </>
  );
}
