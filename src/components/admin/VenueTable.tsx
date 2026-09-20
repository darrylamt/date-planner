"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  /**
   * How the venue is priced at all. "figure" is a per-person amount with no
   * menu behind it, an entrance fee or a flat cover, which is a finished state
   * rather than a missing menu. "nothing" is genuinely unpriced.
   */
  pricedBy: "menu" | "figure" | "nothing";
  /** Null when Google has no hours for it, so nothing guards the plan. */
  hoursKnown: boolean;
  /** Linked venues are the only ones the closure sweep can notice. */
  linked: boolean;
}

/**
 * The views the dashboard tiles point at.
 *
 * Those tiles used to link to /admin, the page they were already on, so
 * clicking "4 not linked to Google" did nothing at all and there was no way
 * from the count to the four venues it was counting. A number you cannot act
 * on is decoration.
 */
const FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "no-hours", label: "No hours", test: (r: Row) => !r.hoursKnown },
  { id: "unlinked", label: "Not on Google", test: (r: Row) => !r.linked },
  { id: "unpriced", label: "Unpriced", test: (r: Row) => r.is_active && r.pricedBy === "nothing" },
  /*
   * Priced by a figure somebody typed, with no menu behind it.
   *
   * Its own chip because it is the one price in the catalogue nothing checks.
   * A menu price came off a menu and goes stale visibly -- the Stale chip
   * counts the days. A typical-spend figure was a judgement on the day it was
   * entered and then never looked at again, and it is what the planner spends
   * against for every one of these venues. This is the list to re-read.
   */
  {
    id: "typical-spend",
    label: "Typical spend",
    test: (r: Row) => r.is_active && r.pricedBy === "figure",
  },
  { id: "stale", label: "Stale menu", test: (r: Row) => r.isStale },
  { id: "inactive", label: "Inactive", test: (r: Row) => !r.is_active },
] as const;

export interface Queue {
  href: string;
  label: string;
  n: number;
  /** Somebody is waiting on this one, or a venue is being withheld. */
  urgent: boolean;
}

export function VenueTable({ rows, queues = [] }: { rows: Row[]; queues?: Queue[] }) {
  const params = useSearchParams();
  const active = params.get("filter") ?? "all";
  const current = FILTERS.find((f) => f.id === active) ?? FILTERS[0];

  const visible = useMemo(() => rows.filter((r) => current.test(r)), [rows, current]);

  const paged = usePagedRows(
    visible,
    (r, needle) =>
      r.name.toLowerCase().includes(needle) ||
      r.area.toLowerCase().includes(needle) ||
      r.type.toLowerCase().includes(needle)
  );

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const n = rows.filter((r) => f.test(r)).length;
          const on = f.id === current.id;
          return (
            <Link
              key={f.id}
              href={f.id === "all" ? "/admin" : `/admin?filter=${f.id}`}
              scroll={false}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                on
                  ? "border-flame bg-flame text-blush"
                  : "border-line text-cocoa hover:border-flame hover:text-flame"
              }`}
            >
              {f.label}
              <span className={on ? "ml-1.5 opacity-80" : "ml-1.5 text-mutedbrown"}>{n}</span>
            </Link>
          );
        })}

        {/*
          The queues that are not filters, in the same row and the same shape.

          They used to be a grid of tiles above this, each with a number, a
          label and a sentence underneath. Four of the seven counted exactly
          what a chip here already counts, so the same figure appeared twice
          on one screen in two different designs, and the explanatory sentence
          was the least readable text in the admin.

          These four have nowhere else to go: a report, an unapproved number
          and a thin menu are queues on other pages, not ways of filtering
          this table. So they keep a destination and lose the tile.
        */}
        {queues.length ? (
          <>
            <span aria-hidden className="mx-1 h-5 w-px bg-line" />
            {queues.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-cocoa transition-colors hover:border-flame hover:text-flame"
              >
                {q.label}
                {/*
                  Urgent colours the number rather than the whole chip. A row
                  of chips that are each shouting reads as one flat alarm, and
                  the thing that actually differs between them is the count.
                */}
                <span className={`ml-1.5 ${q.urgent ? "font-bold text-staletext" : "text-mutedbrown"}`}>
                  {q.n}
                </span>
              </Link>
            ))}
          </>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SearchBox
          value={paged.query}
          onChange={paged.setQuery}
          placeholder="Search name, area or type"
        />
        {current.id !== "all" && (
          <span className="text-[13px] text-mutedbrown">
            Showing {visible.length} of {rows.length}
          </span>
        )}
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
                {/*
                  Per person when that is what the row is priced by, for two
                  otherwise. Halving a menu total would be a different claim
                  from the one the menu makes, but a typical-spend venue holds
                  a per-person figure and doubling it to display it, on the
                  screen for auditing per-person figures, hides the number
                  being audited.
                */}
                <td className="hidden font-mono md:table-cell">
                  {r.pricedBy === "figure"
                    ? `${ghs(Math.round(r.avgForTwo / 2))} pp`
                    : ghs(r.avgForTwo)}
                </td>
                <td className="hidden lg:table-cell">
                  {r.staleDays === null
                    ? r.pricedBy === "figure"
                      ? "no menu"
                      : "never"
                    : r.staleDays === 0
                      ? "today"
                      : `${r.staleDays} days ago`}
                </td>
                <td className="whitespace-nowrap">
                  {/*
                    "Stale" used to cover three unrelated situations, and two of
                    them could never be cleared, so the badge stopped carrying
                    information. Now it means one thing: there is a menu and it
                    is old.
                  */}
                  {r.isStale ? (
                    <span className="badge b-stale">Stale · {r.staleDays}d</span>
                  ) : r.pricedBy === "nothing" ? (
                    <span className="badge b-stale">No prices</span>
                  ) : r.pricedBy === "figure" ? (
                    <span className="badge b-ok">Fee only</span>
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
