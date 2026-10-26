"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A table shown a page at a time, so a long list is not one long scroll.
 *
 * The rows arrive already drawn (a server page can hand them over), and only
 * the page being looked at is shown. Changing the rows (a search) goes back
 * to the first page.
 */
export function PagedTable({
  head,
  rows,
  pageSize = 15,
  empty = "Nothing here.",
  minWidth,
}: {
  /** The header row's cells. */
  head: ReactNode;
  rows: ReactNode[];
  pageSize?: number;
  empty?: string;
  /** Wider than a phone: the table scrolls sideways inside its card. */
  minWidth?: number;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => setPage(0), [rows.length]);
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * pageSize, at * pageSize + pageSize);

  if (!rows.length) return <div className="adm-tile mt-3 text-[14px] text-mutedbrown" data-tone="clear">{empty}</div>;

  return (
    <div className="mt-3">
      <div className="card overflow-x-auto p-0">
        <table className="tbl w-full" style={minWidth ? { minWidth } : undefined}>
          <thead>
            <tr>{head}</tr>
          </thead>
          <tbody>{shown}</tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="mt-2 flex items-center justify-between gap-3 text-[13px] text-mutedbrown">
          <span>
            {at * pageSize + 1}–{Math.min(rows.length, (at + 1) * pageSize)} of {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn2 btnsm" disabled={at === 0} onClick={() => setPage(at - 1)}>
              Back
            </button>
            <span className="tabular-nums">
              {at + 1} / {pages}
            </span>
            <button type="button" className="btn2 btnsm" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
