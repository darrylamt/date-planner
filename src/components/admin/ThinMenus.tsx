"use client";

import Link from "next/link";
import { Pager, SearchBox, usePagedRows } from "./TableControls";

interface Row {
  id: string;
  name: string;
  area: string;
  type: string;
  cuisine: string | null;
  mains: number;
  starters: number;
  desserts: number;
  drinks: number;
  other: number;
  total: number;
}

/** Fewer than this and a party is served the same handful whatever it asked for. */
const ENOUGH_MAINS = 5;

function verdict(r: Row): { label: string; className: string } {
  if (r.total === 0) return { label: "No menu at all", className: "badge b-stale" };
  if (r.mains === 0) return { label: "No mains", className: "badge b-stale" };
  if (r.mains < ENOUGH_MAINS) return { label: `Only ${r.mains} mains`, className: "badge b-stale" };
  return { label: "Enough to choose from", className: "badge b-ok" };
}

export function ThinMenus({ rows }: { rows: Row[] }) {
  const paged = usePagedRows(
    rows,
    (r, needle) =>
      r.name.toLowerCase().includes(needle) ||
      r.area.toLowerCase().includes(needle) ||
      r.type.toLowerCase().includes(needle)
  );

  const needWork = rows.filter((r) => r.mains < ENOUGH_MAINS).length;
  const noCuisine = rows.filter((r) => !r.cuisine).length;

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SearchBox
          value={paged.query}
          onChange={paged.setQuery}
          placeholder="Search name or area"
        />
        <span className="text-[13px] text-mutedbrown">
          {needWork} of {rows.length} need more of their menu on file
          {noCuisine ? `, ${noCuisine} have no cuisine recorded` : ""}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="tbl w-full border-collapse">
          <thead>
            <tr>
              <th>Venue</th>
              <th className="hidden md:table-cell">Area</th>
              <th>Cuisine</th>
              <th>Mains</th>
              <th className="hidden lg:table-cell">Starters</th>
              <th className="hidden lg:table-cell">Desserts</th>
              <th className="hidden lg:table-cell">Drinks</th>
              <th className="hidden md:table-cell">Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.pageRows.map((r) => {
              const v = verdict(r);
              return (
                <tr key={r.id}>
                  <td className="font-bold">
                    {r.name}
                    <div className="mt-0.5 text-[12px] font-normal text-mutedbrown md:hidden">
                      {r.area} · {r.mains} mains of {r.total} items
                    </div>
                  </td>
                  <td className="hidden md:table-cell">{r.area}</td>
                  <td className="whitespace-nowrap capitalize">
                    {r.cuisine ?? (
                      <span className="text-staletext">not recorded</span>
                    )}
                  </td>
                  <td
                    className={`font-mono font-bold ${
                      r.mains < ENOUGH_MAINS ? "text-staletext" : ""
                    }`}
                  >
                    {r.mains}
                  </td>
                  <td className="hidden font-mono lg:table-cell">{r.starters}</td>
                  <td className="hidden font-mono lg:table-cell">{r.desserts}</td>
                  <td className="hidden font-mono lg:table-cell">{r.drinks}</td>
                  <td className="hidden font-mono md:table-cell">{r.total}</td>
                  <td>
                    <span className={v.className}>{v.label}</span>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link
                      href={`/admin/venues/${r.id}`}
                      className="font-semibold text-flame hover:text-flame-dark"
                    >
                      Add dishes
                    </Link>
                    <Link
                      href="/admin/import"
                      className="ml-3 font-semibold text-cocoa hover:text-ink"
                    >
                      CSV
                    </Link>
                  </td>
                </tr>
              );
            })}
            {paged.total === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-mutedbrown">
                  No venue matches “{paged.query}”.
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
        unit="eating venues"
        onGoTo={paged.goTo}
      />
    </>
  );
}
