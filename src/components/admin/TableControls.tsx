"use client";

import { useState } from "react";

/**
 * Search and paging for the admin tables.
 *
 * Ten rows at a time. The catalogue is the thing these screens exist to keep
 * honest, and a six-hundred-row menu rendered in one go is a screen nobody
 * reads: you scroll past the row you wanted, and the header scrolls away with
 * it. Paging also keeps the page cheap on a phone, which is where most of this
 * gets done.
 *
 * One hook and one pager rather than each table growing its own, because eight
 * tables with eight slightly different notions of "next" is how the Back
 * button ends up disabled on one screen and missing on another.
 */
export const ADMIN_PAGE_SIZE = 10;

/**
 * Which slice of the rows to show.
 *
 * Pulled out as a pure function so the awkward part can be tested without
 * rendering anything. The page is derived and clamped rather than stored,
 * which is the point: approving the last pending phone, or typing a search
 * that narrows eleven rows to three, would otherwise leave the view on a page
 * that no longer exists, showing an empty table with no obvious way back.
 */
export function pageWindow(
  total: number,
  requestedPage: number,
  pageSize: number
): { page: number; pageCount: number; start: number } {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.floor(requestedPage) || 0, 0), pageCount - 1);
  return { page, pageCount, start: page * pageSize };
}

export function usePagedRows<T>(
  rows: T[],
  matches?: (row: T, needle: string) => boolean,
  pageSize: number = ADMIN_PAGE_SIZE
) {
  const [query, setQuery] = useState("");
  const [requestedPage, setRequestedPage] = useState(0);

  const needle = query.trim().toLowerCase();
  const filtered = needle && matches ? rows.filter((r) => matches(r, needle)) : rows;

  const { page, pageCount, start } = pageWindow(filtered.length, requestedPage, pageSize);
  const pageRows = filtered.slice(start, start + pageSize);

  return {
    query,
    /** Typing always returns to the first page; page 4 of a new search is nowhere. */
    setQuery: (next: string) => {
      setQuery(next);
      setRequestedPage(0);
    },
    page,
    pageCount,
    start,
    pageRows,
    /** Rows matching the search, across all pages. */
    total: filtered.length,
    /** Rows before the search, so a table can say what was filtered out. */
    totalUnfiltered: rows.length,
    goTo: setRequestedPage,
  };
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <input
      className="inp h-[42px] max-w-[280px]"
      type="search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Pager({
  page,
  pageCount,
  start,
  count,
  total,
  unit,
  onGoTo,
}: {
  page: number;
  pageCount: number;
  start: number;
  /** Rows on this page, which is fewer than the page size on the last one. */
  count: number;
  total: number;
  unit: string;
  onGoTo: (page: number) => void;
}) {
  if (!total) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <span className="text-[13px] text-mutedbrown">
        {pageCount === 1
          ? `${total} ${unit}`
          : `${start + 1} to ${start + count} of ${total} ${unit}`}
      </span>

      {/* Buttons only when there is somewhere to go. Controls that cannot do
          anything are the first thing a tester presses. */}
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <button
            className="btn2 btnsm px-4"
            disabled={page === 0}
            onClick={() => onGoTo(page - 1)}
          >
            Back
          </button>
          <span className="px-1 text-[13px] tabular-nums text-mutedbrown">
            {page + 1} / {pageCount}
          </span>
          <button
            className="btn2 btnsm px-4"
            disabled={page >= pageCount - 1}
            onClick={() => onGoTo(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
