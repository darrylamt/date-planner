"use client";

import Link from "next/link";
import { useState } from "react";
import { ghs } from "@/lib/format";
import { Pager, SearchBox, usePagedRows } from "./TableControls";

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
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, VerifyResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  /*
   * The checkbox narrows before paging, so "only unverified" gives ten
   * unverified venues rather than however many of the first ten happened to
   * qualify.
   */
  const visible = rows.filter(
    (r) => !onlyUnverified || (results[r.id]?.verdict ?? r.verification) !== "real"
  );
  const paged = usePagedRows(
    visible,
    (r, needle) =>
      r.name.toLowerCase().includes(needle) ||
      r.area.toLowerCase().includes(needle) ||
      r.type.toLowerCase().includes(needle)
  );
  const q = paged.query;

  async function verify(id: string) {
    if (busyId) return; // one at a time, each call costs money and ~45s
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
        <SearchBox
          value={q}
          onChange={paged.setQuery}
          placeholder="Search name, area or type"
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
            {/*
              Most columns are hidden on a phone rather than squeezed. Nine
              columns in a horizontal scroller is technically usable and
              actually horrible: you lose the venue name the moment you scroll
              to the thing you came to read. Name, status and the actions are
              what the screen is for; the rest is desk work.
            */}
            <tr>
              <th>Venue</th>
              <th className="hidden md:table-cell">Area</th>
              <th className="hidden lg:table-cell">Type</th>
              <th className="hidden lg:table-cell">Items</th>
              <th className="hidden md:table-cell">Avg price (2)</th>
              <th className="hidden lg:table-cell">Menu updated</th>
              <th>Status</th>
              <th className="hidden md:table-cell">Verified</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.pageRows.map((r) => {
              const live = results[r.id];
              const status = live?.verdict ?? r.verification;
              const discrepancies = live ? live.discrepancies.length : r.discrepancies;
              const isOpen = openId === r.id && live;

              return (
                <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
                  <td className="font-bold">
                    {r.name}
                    {/* The columns hidden on a phone, folded under the name so
                        the row still says what it is. */}
                    <div className="mt-0.5 text-[12px] font-normal text-mutedbrown md:hidden">
                      {r.area} · {r.type} · {ghs(r.avgForTwo)}
                    </div>
                    {isOpen && (
                      <div className="mt-2 max-w-[520px] whitespace-normal rounded-xl bg-whybg p-3 text-[13px] font-normal leading-relaxed">
                        <div className="mb-1 font-semibold">
                          {live.canonical_name ?? r.name}, confidence {live.confidence}
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
                  <td className="hidden md:table-cell">{r.area}</td>
                  <td className="hidden capitalize lg:table-cell">{r.type}</td>
                  <td className="hidden lg:table-cell">{r.items}</td>
                  <td className="hidden font-mono md:table-cell">{ghs(r.avgForTwo)}</td>
                  <td className="hidden lg:table-cell">
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
                  <td className="hidden md:table-cell">
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
            {paged.total === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-mutedbrown">
                  No venues match {q ? `“${q}”` : "the current filter"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager
        page={paged.page}
        pageCount={paged.pageCount}
        start={paged.start}
        count={paged.pageRows.length}
        total={paged.total}
        unit="venues"
        onGoTo={paged.goTo}
      />

      <p className="mt-4 text-[13px] text-mutedbrown">
        Verifying searches the web and takes 40–60 seconds per venue. For a whole
        catalog run <code className="font-mono">npm run verify:catalog</code> instead, a browser request will time out long before it finishes.
      </p>
    </>
  );
}
