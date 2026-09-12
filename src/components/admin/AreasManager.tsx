"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ADMIN_PAGE_SIZE, Pager, SearchBox, usePagedRows } from "./TableControls";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import Link from "next/link";
import type { Area } from "@/lib/types";
import type { AreaVenue } from "@/app/admin/areas/page";

export function AreasManager({
  areas,
  venuesByArea,
}: {
  areas: Area[];
  venuesByArea: Record<string, AreaVenue[]>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [city, setCity] = useState("Accra");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const paged = usePagedRows(
    areas,
    (a, needle) =>
      a.name.toLowerCase().includes(needle) || (a.city ?? "").toLowerCase().includes(needle)
  );

  async function add() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("areas").insert({ name, city });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setToast("Area added");
    setTimeout(() => setToast(null), 1600);
    router.refresh();
  }

  async function rename(a: Area) {
    const next = prompt(`Rename "${a.name}" to:`, a.name);
    if (!next || next === a.name) return;
    await supabase.from("areas").update({ name: next }).eq("id", a.id);
    router.refresh();
  }

  async function remove(a: Area) {
    if (!confirm(`Delete area "${a.name}"? Venues in it will block deletion.`)) return;
    const { error } = await supabase.from("areas").delete().eq("id", a.id);
    if (error) setError(`Can't delete "${a.name}", it still has venues or events.`);
    router.refresh();
  }

  return (
    <div className="max-w-[640px]">
      <h1 className="font-display text-[24px] font-bold">Areas</h1>
      <div className="text-[14px] text-mutedbrown">
        The neighbourhood chips shown on the &ldquo;Where in Accra?&rdquo; step.
      </div>

      <div className="card mt-5 flex flex-wrap items-end gap-3 p-5">
        <div className="flex-1">
          <span className="flbl">Name</span>
          <input className="inp h-[42px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tema" />
        </div>
        <div className="w-[140px]">
          <span className="flbl">City</span>
          <input className="inp h-[42px]" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <button className="btn btnsm px-6" onClick={add} disabled={busy || !name.trim()}>
          Add area
        </button>
        {error && <div className="why w-full not-italic text-staletext">{error}</div>}
      </div>

      {areas.length > ADMIN_PAGE_SIZE ? (
        <div className="mt-6">
          <SearchBox value={paged.query} onChange={paged.setQuery} placeholder="Search areas" />
        </div>
      ) : null}

      <table className="tbl mt-6 w-full">
        <thead>
          <tr>
            <th>Area</th>
            <th className="hidden sm:table-cell">City</th>
            <th>Venues</th>
            <th>Plannable</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {paged.pageRows.flatMap((a) => {
            const here = venuesByArea[a.id] ?? [];
            /*
             * Two counts, because they answer different questions. How many
             * venues are filed here, and how many of those the planner can
             * actually put in an evening: an unpriced one is withheld, so an
             * area with six venues and one price produces a one-stop plan.
             */
            const plannable = here.filter((v) => v.plannable).length;
            const isOpen = open === a.id;

            return [
            <tr key={a.id}>
              <td className="font-bold">
                {a.name}
                <div className="text-[12px] font-normal text-mutedbrown sm:hidden">{a.city}</div>
              </td>
              <td className="hidden sm:table-cell">{a.city}</td>
              <td className="font-mono">{here.length}</td>
              <td className="font-mono">
                {plannable === 0 && here.length > 0 ? (
                  <span className="badge b-stale">none of {here.length}</span>
                ) : plannable < 2 ? (
                  <span className="badge b-stale">{plannable}</span>
                ) : (
                  <span className="badge b-ok">{plannable}</span>
                )}
              </td>
              <td className="whitespace-nowrap">
                {here.length ? (
                  <button
                    className="mr-3 font-semibold text-cocoa hover:text-ink"
                    onClick={() => setOpen(isOpen ? null : a.id)}
                  >
                    {isOpen ? "Hide" : "Show"}
                  </button>
                ) : null}
                <button className="font-semibold text-flame hover:text-flame-dark" onClick={() => rename(a)}>
                  Rename
                </button>
                <button className="ml-3 font-semibold text-staletext hover:underline" onClick={() => remove(a)}>
                  Delete
                </button>
              </td>
            </tr>,

            /*
             * The venues themselves, under the area, only when asked for.
             * Fifty venues listed all at once is a directory; ten areas you
             * can open one at a time is a place to work.
             */
            isOpen ? (
              <tr key={`${a.id}-open`} className="bg-cream/40">
                <td colSpan={5}>
                  <div className="flex flex-wrap gap-2 px-1 py-2">
                    {here.map((v) => (
                      <Link
                        key={v.id}
                        href={`/admin/venues/${v.id}`}
                        className={`rounded-bar border px-3 py-1.5 text-[13px] transition hover:border-mutedbrown ${
                          v.plannable
                            ? "border-line bg-shell text-ink"
                            : "border-staletext/40 bg-shell text-staletext"
                        } ${v.isActive ? "" : "opacity-50 line-through"}`}
                        title={
                          !v.isActive
                            ? "Paused"
                            : v.plannable
                              ? v.type
                              : "No price and no menu, so plans withhold it"
                        }
                      >
                        {v.name}
                        <span className="ml-1.5 text-[11px] text-mutedbrown">{v.type}</span>
                      </Link>
                    ))}
                  </div>
                </td>
              </tr>
            ) : null,
            ];
          })}
          {paged.total === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-mutedbrown">
                {paged.query ? `No area matches “${paged.query}”.` : "No areas yet."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Pager
        page={paged.page}
        pageCount={paged.pageCount}
        start={paged.start}
        count={paged.pageRows.length}
        total={paged.total}
        unit="areas"
        onGoTo={paged.goTo}
      />

      {toast && <Toast message={toast} />}
    </div>
  );
}
