"use client";

import Link from "next/link";
import { ghs } from "@/lib/format";
import { Pager, SearchBox, usePagedRows } from "./TableControls";

/**
 * The venue list.
 *
 * The web-search verifier used to live on this table, one button per row. It
 * is gone: the research is being done by hand, and a button that spends money
 * and forty seconds to produce a second opinion nobody was going to act on is
 * worse than no button. The verification columns are still on the venues
 * table, holding whatever the last run wrote; nothing reads them now.
 */
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
  /** Null when Google has no hours for it, so nothing guards the plan. */
  hoursKnown: boolean;
}

export function VenueTable({ rows }: { rows: Row[] }) {
  const paged = usePagedRows(
    rows,
    (r, needle) =>
      r.name.toLowerCase().includes(needle) ||
      r.area.toLowerCase().includes(needle) ||
      r.type.toLowerCase().includes(needle)
  );

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SearchBox
          value={paged.query}
          onChange={paged.setQuery}
          placeholder="Search name, area or type"
        />
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.pageRows.map((r) => (
              <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
                <td className="font-bold">
                  {r.name}
                  {/* The columns hidden on a phone, folded under the name so
                      the row still says what it is. */}
                  <div className="mt-0.5 text-[12px] font-normal text-mutedbrown md:hidden">
                    {r.area} · {r.type} · {ghs(r.avgForTwo)}
                  </div>
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
                <td className="whitespace-nowrap">
                  {r.isStale ? (
                    <span className="badge b-stale">
                      Stale{r.staleDays !== null ? ` · ${r.staleDays}d` : ""}
                    </span>
                  ) : (
                    <span className="badge b-ok">Fresh</span>
                  )}
                  {/*
                    Without hours, nothing stops a plan sending someone here on
                    a day it is shut. Worth seeing at a glance, because the fix
                    is one click on the venue's Google link.
                  */}
                  {!r.hoursKnown ? (
                    <span className="badge b-stale ml-1.5" title="No opening hours on file">
                      No hours
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap">
                  <Link
                    href={`/admin/venues/${r.id}`}
                    className="font-semibold text-flame hover:text-flame-dark"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {paged.total === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-mutedbrown">
                  No venues match {paged.query ? `“${paged.query}”` : "the current filter"}.
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
    </>
  );
}
