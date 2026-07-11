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
}

export function VenueTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      r.area.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <input
        className="inp mt-5 h-[42px] max-w-[280px]"
        placeholder="Search venues…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className={r.is_active ? "" : "opacity-50"}>
                <td className="font-bold">{r.name}</td>
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
                  <Link
                    href={`/admin/venues/${r.id}`}
                    className="font-semibold text-flame hover:text-flame-dark"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-mutedbrown">
                  No venues match “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
