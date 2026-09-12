"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ADMIN_PAGE_SIZE, Pager, SearchBox, usePagedRows } from "./TableControls";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import type { Area } from "@/lib/types";

export function AreasManager({ areas }: { areas: Area[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [city, setCity] = useState("Accra");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            <th>City</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {paged.pageRows.map((a) => (
            <tr key={a.id}>
              <td className="font-bold">{a.name}</td>
              <td>{a.city}</td>
              <td className="whitespace-nowrap">
                <button className="font-semibold text-flame hover:text-flame-dark" onClick={() => rename(a)}>
                  Rename
                </button>
                <button className="ml-3 font-semibold text-staletext hover:underline" onClick={() => remove(a)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {paged.total === 0 && (
            <tr>
              <td colSpan={3} className="py-8 text-center text-mutedbrown">
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
