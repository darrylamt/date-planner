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
  shared: boolean;
  updated: string | null;
  free: boolean;
}

/** The venues on the Menus desk: search, thinnest first, each to its editor. */
export function MenuList({ rows }: { rows: MenuListRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows
        .filter((r) => !q || `${r.name} ${r.area} ${r.type}`.toLowerCase().includes(q))
        .sort((a, b) => a.items - b.items || a.name.localeCompare(b.name)),
    [rows, q]
  );
  const days = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 864e5) : null);

  return (
    <div className="mt-4">
      <input className="inp max-w-[320px]" placeholder="Search by name, area or type" value={query} onChange={(e) => setQuery(e.target.value)} />
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
