"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PagedTable } from "./PagedTable";

export interface MenuListRow {
  id: string;
  name: string;
  area: string;
  type: string;
  items: number;
  /** Lines filed under drinks: none at a place people eat means a dinner there has nothing to drink priced. */
  drinks: number;
  shared: boolean;
  updated: string | null;
  free: boolean;
}

// Where somebody sits down to eat or drink, so a menu with food and no drinks is half a menu.
const SERVES_DRINKS = new Set(["restaurant", "cafe", "lounge"]);
const missingDrinks = (r: MenuListRow) => SERVES_DRINKS.has(r.type) && r.items > 0 && r.drinks === 0;

/** The venues on the Menus desk: search, thinnest first, each to its editor. */
export function MenuList({ rows }: { rows: MenuListRow[] }) {
  const [query, setQuery] = useState("");
  const [drinksOnly, setDrinksOnly] = useState(false);
  const q = query.trim().toLowerCase();
  const missing = useMemo(() => rows.filter(missingDrinks).length, [rows]);
  const shown = useMemo(
    () =>
      rows
        .filter((r) => !q || `${r.name} ${r.area} ${r.type}`.toLowerCase().includes(q))
        .filter((r) => !drinksOnly || missingDrinks(r))
        .sort((a, b) => a.items - b.items || a.name.localeCompare(b.name)),
    [rows, q, drinksOnly]
  );
  const days = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 864e5) : null);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className="inp max-w-[320px]" placeholder="Search by name, area or type" value={query} onChange={(e) => setQuery(e.target.value)} />
        {missing ? (
          <label className="flex items-center gap-2 text-[13px] text-mutedbrown">
            <input type="checkbox" checked={drinksOnly} onChange={(e) => setDrinksOnly(e.target.checked)} />
            Only the {missing} with no drinks on file
          </label>
        ) : null}
      </div>
      <PagedTable
        empty="No venue matches that."
        minWidth={480}
        head={
          <>
            <th>Venue</th>
            <th>Dishes</th>
            <th>Last changed</th>
            <th />
          </>
        }
        rows={shown.map((r) => {
          const d = days(r.updated);
          return (
            <tr key={r.id}>
              <td>
                <div className="font-semibold">{r.name}</div>
                <div className="text-[12px] text-mutedbrown">
                  {r.area} · {r.type}
                  {r.shared ? " · shares another branch's menu" : ""}
                  {r.free ? " · free to visit" : ""}
                </div>
                {missingDrinks(r) ? <div className="mt-0.5 text-[12px] text-staletext">No drinks on file: add their drinks list</div> : null}
              </td>
              <td className="tabular-nums">{r.items === 0 ? <span className="badge b-stale">None</span> : r.items}</td>
              <td className="whitespace-nowrap text-mutedbrown">{d == null ? "never" : d === 0 ? "today" : `${d} days ago`}</td>
              <td className="text-right">
                <Link href={`/admin/menu/${r.id}`} className="btn2 btnsm whitespace-nowrap">
                  Edit menu
                </Link>
              </td>
            </tr>
          );
        })}
      />
    </div>
  );
}
