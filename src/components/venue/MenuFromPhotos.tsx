"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readMenuFiles, type ReadItem } from "@/lib/menuRead";
import { parseClock, parseDays } from "@/lib/menuTiming";
import { IconSparkle, IconWarn } from "@/components/planner/icons";
import type { MenuCategory, MenuItem } from "@/lib/types";
import type { MenuScope } from "./MenuManager";

const COURSE_LABEL: Record<string, string> = {
  starter: "Starter",
  main: "Main",
  dessert: "Dessert",
  drink: "Drink",
  activity: "Thing to do",
  other: "Extra",
};

type Row = ReadItem & { key: number; on: boolean; existing: MenuItem | null };

/**
 * A menu from a photo, for the venue's own Menu page.
 *
 * Owners were told to email a long menu in and wait for someone to type it.
 * Now the photo is read here (/api/ai/menu, Gemini) into a list they check:
 * every row can be unticked or corrected, the ones the reader was unsure of
 * are marked, and a dish already on the menu is updated rather than added
 * twice. Nothing is saved until they press Add.
 *
 * Shared menus: new dishes go on the menu every branch shares, as adding one
 * by hand does by default.
 */
export function MenuFromPhotos({
  scope,
  existing,
  onSaved,
}: {
  scope: MenuScope;
  existing: MenuItem[];
  /** Rows added and rows updated, for the page's list. */
  onSaved: (added: MenuItem[], updated: MenuItem[]) => void;
}) {
  const supabase = createClient();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "reading" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<string[]>([]);

  const byName = new Map(existing.map((m) => [m.name.trim().toLowerCase(), m]));
  const chosen = rows.filter((r) => r.on && r.name.trim() && r.price_ghs > 0);

  async function read(files: File[]) {
    setBusy("reading");
    setError(null);
    const r = await readMenuFiles(files.slice(0, 6));
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setRows(
      r.data.items.map((i, key) => {
        const match = byName.get(i.name.trim().toLowerCase()) ?? null;
        // Already there at the same price: nothing to do, so not ticked.
        const same = match && Number(match.price_ghs) === i.price_ghs;
        return { ...i, key, existing: match, on: !same };
      })
    );
    setNotes([
      ...(r.data.skipped.length ? [`No readable price, so left out: ${r.data.skipped.join(", ")}.`] : []),
      ...(r.data.chargesNotes.length ? [`Your menu says: "${r.data.chargesNotes.join(" ")}" Tell us if we should add that to bills.`] : []),
    ]);
  }

  const edit = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save() {
    setBusy("saving");
    setError(null);
    const added: MenuItem[] = [];
    const updated: MenuItem[] = [];
    for (const r of chosen) {
      const fields: Record<string, unknown> = {
        name: r.name.trim().slice(0, 160),
        price_ghs: r.price_ghs,
        category: r.category,
        notes: r.notes?.trim() || null,
        is_alcoholic: r.category === "drink" ? (r.alcoholic === "yes" ? true : r.alcoholic === "no" ? false : null) : false,
        covers_people: r.covers_people && r.covers_people > 1 ? r.covers_people : 1,
        ...(r.dietary?.trim() ? { dietary_note: r.dietary.trim().slice(0, 80) } : {}),
        ...(r.days?.trim() && parseDays(r.days) ? { available_days: parseDays(r.days) } : {}),
        ...(r.from?.trim() && parseClock(r.from) != null ? { available_from_minute: parseClock(r.from) } : {}),
        ...(r.to?.trim() && parseClock(r.to) != null ? { available_to_minute: parseClock(r.to) } : {}),
      };
      const q = r.existing
        ? supabase.from("menu_items").update(fields).eq("id", r.existing.id).select("*").single()
        : supabase.from("menu_items").insert({ ...fields, venue_id: scope.ownerId }).select("*").single();
      const { data, error: err } = await q;
      if (err || !data) {
        setBusy(null);
        onSaved(added, updated);
        return setError(`Stopped at "${r.name}": it didn't save. ${added.length + updated.length} saved before it. Try again.`);
      }
      (r.existing ? updated : added).push(data as MenuItem);
    }
    setBusy(null);
    onSaved(added, updated);
    setRows([]);
    setNotes([]);
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="pl-btn-soft w-full sm:w-auto" onClick={() => setOpen(true)}>
        <IconSparkle size={18} /> Add from a photo of your menu
      </button>
    );
  }

  return (
    <div className="pl-card p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <h2 className="text-[18px] font-bold">Add from a photo of your menu</h2>
          <p className="text-[14px] text-[var(--p-muted)]">
            Up to 6 photos or a PDF. We read the dishes and prices; you check them before anything is added.
          </p>
        </div>
        <button type="button" className="pl-btn" disabled={busy !== null} onClick={() => input.current?.click()}>
          {busy === "reading" ? "Reading your menu…" : rows.length ? "Read other photos" : "Choose photos"}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*,.pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            e.target.value = "";
            if (fs.length) void read(fs);
          }}
        />
      </div>

      {error ? <div className="mt-3 text-[14px] font-semibold text-[var(--p-warn)]">{error}</div> : null}

      {rows.length ? (
        <>
          <div className="mt-4 text-[14px] text-[var(--p-ink-2)]">
            <b>{rows.length} read.</b> Untick anything wrong, and fix names or prices by tapping them.
            {rows.some((r) => r.unsure) ? " The ones marked ⚠ were hard to read: check them against your menu." : ""}
          </div>
          <div className="mt-3 flex flex-col divide-y divide-[var(--p-line)] rounded-2xl border border-[var(--p-line)]">
            {rows.map((r) => (
              <label key={r.key} className={`flex items-center gap-3 px-3 py-2.5 ${r.on ? "" : "opacity-50"}`}>
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--p-accent)]" checked={r.on} onChange={(e) => edit(r.key, { on: e.target.checked })} />
                <div className="min-w-0 flex-1">
                  <input
                    className="w-full bg-transparent text-[15px] font-semibold outline-none"
                    value={r.name}
                    onChange={(e) => edit(r.key, { name: e.target.value })}
                  />
                  <div className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-[var(--p-muted)]">
                    <select
                      className="bg-transparent"
                      value={r.category}
                      onChange={(e) => edit(r.key, { category: e.target.value as MenuCategory })}
                    >
                      {Object.entries(COURSE_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    {r.notes ? <span className="truncate">· {r.notes}</span> : null}
                    {r.days || r.from || r.to ? <span>· {[r.days, [r.from, r.to].filter(Boolean).join("–")].filter(Boolean).join(" ")}</span> : null}
                    {r.existing ? (
                      <span className="font-semibold text-[var(--p-accent)]">
                        · {Number(r.existing.price_ghs) === r.price_ghs ? "already on your menu" : `updates GHS ${Number(r.existing.price_ghs)}`}
                      </span>
                    ) : null}
                    {r.unsure ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-[var(--p-warn)]">
                        <IconWarn size={13} /> check
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 text-[14px] text-[var(--p-muted)]">GHS</span>
                <input
                  className="w-[72px] shrink-0 rounded-lg border border-[var(--p-line)] px-2 py-1 text-right text-[15px] font-semibold"
                  inputMode="decimal"
                  value={r.price_ghs || ""}
                  onChange={(e) => edit(r.key, { price_ghs: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })}
                />
              </label>
            ))}
          </div>
          {notes.map((n) => (
            <p key={n} className="mt-2 text-[13.5px] text-[var(--p-muted)]">
              {n}
            </p>
          ))}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="pl-btn" disabled={busy !== null || !chosen.length} onClick={() => void save()}>
              {busy === "saving" ? "Saving…" : `Add ${chosen.length} to your menu`}
            </button>
            <button
              type="button"
              className="text-[14px] font-bold text-[var(--p-muted)]"
              disabled={busy !== null}
              onClick={() => {
                setRows([]);
                setNotes([]);
                setOpen(false);
              }}
            >
              Cancel
            </button>
            {scope.branchCount > 1 ? (
              <span className="text-[13px] text-[var(--p-muted)]">New dishes go on the menu all {scope.branchCount} branches share.</span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
