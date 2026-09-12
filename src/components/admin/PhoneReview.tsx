"use client";

import { useState } from "react";
import { ADMIN_PAGE_SIZE, Pager, SearchBox, usePagedRows } from "./TableControls";

interface PendingVenue {
  id: string;
  name: string;
  area: string;
  phone: string | null;
  phone_pending: string | null;
  phone_status: string;
  phone_source: string | null;
  instagram_handle: string | null;
  google_maps_url: string | null;
  phone_report_count: number;
  phone_reported_at: string | null;
}

interface Collision {
  digits: string;
  venue_count: number;
  venue_names: string[];
}

/**
 * Phone review, the only place a number becomes dialable.
 *
 * The reservation flow hands a user to this number over WhatsApp with a
 * message signed "sent via aduro", so an unchecked number is not bad data, it
 * is fraud under our name. Imports, the ingest tool and the verifier can only
 * ever propose; approval happens here and is recorded with who and when.
 */
export function PhoneReview({
  pending,
  approved,
  collisions,
}: {
  pending: PendingVenue[];
  approved: PendingVenue[];
  collisions: Collision[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  /*
   * Two independent pagers, because these are two jobs. Working through the
   * review queue and going to look up one live number are different errands,
   * and sharing a page index between them would move the list you were not
   * looking at.
   */
  const byNameOrNumber = (v: PendingVenue, needle: string) =>
    v.name.toLowerCase().includes(needle) ||
    (v.area ?? "").toLowerCase().includes(needle) ||
    (v.phone_pending ?? "").includes(needle) ||
    (v.phone ?? "").includes(needle);

  const pendingPage = usePagedRows(pending, byNameOrNumber);
  const approvedPage = usePagedRows(approved, byNameOrNumber);

  async function act(venueId: string, action: "approve" | "reject" | "clear") {
    setBusyId(venueId);
    setError(null);
    try {
      const res = await fetch("/api/admin/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, action }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That didn't work.");
        return;
      }
      setDone((d) => ({ ...d, [venueId]: action }));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  /** Digits only, so formatting differences cannot hide a match. */
  const digitsOf = (n: string | null) => (n ?? "").replace(/\D/g, "");
  const collidingDigits = new Set(collisions.map((c) => c.digits));

  return (
    <div className="mt-6 flex flex-col gap-6">
      {error && <div className="why not-italic text-staletext">{error}</div>}

      {collisions.length > 0 && (
        <div className="card border border-staletext px-5 py-4">
          <div className="text-[15px] font-bold text-staletext">
            {collisions.length} number{collisions.length === 1 ? "" : "s"} used by more
            than one venue
          </div>
          <p className="mt-1 text-[14px] leading-relaxed text-cocoa">
            Two venues sharing a number is almost never a coincidence, it is what one
            scammer attached to several listings looks like. Treat every venue below as
            suspect until you have checked each against its own website or Instagram.
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-[14px]">
            {collisions.map((c) => (
              <li key={c.digits}>
                <span className="font-mono text-ink">+{c.digits}</span>{" "}
                <span className="text-mutedbrown">, {c.venue_names.join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card px-5 py-5">
        <div className="text-[15px] font-bold">
          Awaiting review ({pending.length})
        </div>
        <p className="mt-1 text-[14px] text-mutedbrown">
          Check each against the venue&apos;s own website or Instagram, not a
          directory. Directories copy from each other, so one bad number can look
          like three independent sources.
        </p>

        {pending.length > ADMIN_PAGE_SIZE ? (
          <div className="mt-4">
            <SearchBox
              value={pendingPage.query}
              onChange={pendingPage.setQuery}
              placeholder="Search venue or number"
            />
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="tbl w-full border-collapse">
            <thead>
              <tr>
                <th>Venue</th>
                <th>Proposed number</th>
                <th>Where it came from</th>
                <th>Check against</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingPage.pageRows.map((v) => {
                const outcome = done[v.id];
                const collides = collidingDigits.has(digitsOf(v.phone_pending));
                return (
                  <tr key={v.id}>
                    <td className="font-bold">
                      {v.name}
                      <div className="text-[13px] font-normal text-mutedbrown">
                        {v.area}
                      </div>
                    </td>
                    <td className="font-mono">
                      {v.phone_pending}
                      {collides && (
                        <div className="mt-1 text-[12.5px] font-semibold text-staletext">
                          Also on another venue
                        </div>
                      )}
                    </td>
                    <td className="text-[13px] text-mutedbrown">{v.phone_source ?? "source not recorded"}</td>
                    <td className="text-[13px]">
                      <div className="flex flex-col gap-1">
                        {v.instagram_handle ? (
                          <a
                            className="text-flame underline"
                            href={`https://instagram.com/${v.instagram_handle.replace("@", "")}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Instagram
                          </a>
                        ) : null}
                        {v.google_maps_url ? (
                          <a
                            className="text-flame underline"
                            href={v.google_maps_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Maps
                          </a>
                        ) : null}
                        <a
                          className="text-flame underline"
                          href={`https://www.google.com/search?q=${encodeURIComponent(
                            `${v.name} Accra official site phone`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Search
                        </a>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      {outcome ? (
                        <span className="badge b-ok">
                          {outcome === "approve" ? "Approved" : "Rejected"}
                        </span>
                      ) : (
                        <>
                          <button
                            className="font-semibold text-flame disabled:opacity-40"
                            disabled={busyId !== null}
                            onClick={() => act(v.id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            className="ml-3 font-semibold text-staletext disabled:opacity-40"
                            disabled={busyId !== null}
                            onClick={() => act(v.id, "reject")}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-mutedbrown">
                    Nothing waiting. Every number on file has been reviewed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pager
          page={pendingPage.page}
          pageCount={pendingPage.pageCount}
          start={pendingPage.start}
          count={pendingPage.pageRows.length}
          total={pendingPage.total}
          unit="waiting"
          onGoTo={pendingPage.goTo}
        />
      </div>

      <div className="card px-5 py-5">
        <div className="text-[15px] font-bold">Live numbers ({approved.length})</div>
        <p className="mt-1 text-[14px] text-mutedbrown">
          These get dialled. Withdraw one the moment it is questioned, a false alarm
          costs a booking, an unreported bad number costs someone their money.
        </p>

        {approved.length > ADMIN_PAGE_SIZE ? (
          <div className="mt-4">
            <SearchBox
              value={approvedPage.query}
              onChange={approvedPage.setQuery}
              placeholder="Search venue or number"
            />
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="tbl w-full border-collapse">
            <thead>
              <tr>
                <th>Venue</th>
                <th>Number</th>
                <th>Reports</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {approvedPage.pageRows.map((v) => (
                <tr key={v.id}>
                  <td className="font-bold">{v.name}</td>
                  <td className="font-mono">
                    {v.phone}
                    {collidingDigits.has(digitsOf(v.phone)) && (
                      <div className="mt-1 text-[12.5px] font-semibold text-staletext">
                        Also on another venue
                      </div>
                    )}
                  </td>
                  <td>
                    {v.phone_report_count > 0 ? (
                      <span className="badge b-stale">{v.phone_report_count}</span>
                    ) : (
                      <span className="text-mutedbrown">none</span>
                    )}
                  </td>
                  <td>
                    {done[v.id] === "clear" ? (
                      <span className="badge b-stale">Withdrawn</span>
                    ) : (
                      <button
                        className="font-semibold text-staletext disabled:opacity-40"
                        disabled={busyId !== null}
                        onClick={() => act(v.id, "clear")}
                      >
                        Withdraw
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {approved.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-mutedbrown">
                    No live numbers yet. The Reserve button stays hidden until one is
                    approved.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pager
          page={approvedPage.page}
          pageCount={approvedPage.pageCount}
          start={approvedPage.start}
          count={approvedPage.pageRows.length}
          total={approvedPage.total}
          unit="live numbers"
          onGoTo={approvedPage.goTo}
        />
      </div>
    </div>
  );
}
