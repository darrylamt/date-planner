"use client";

import { useEffect, useState } from "react";
import { guessVenue, menuCsv, readMenuFiles, type MenuReadResponse } from "@/lib/menuRead";

/**
 * Read a menu from photos, a PDF or an untidy spreadsheet (/api/ai/menu,
 * Gemini's free tier), and hand the importer a CSV to check.
 *
 * Files first, venue second: the reader reads the venue's name off the menu
 * and offers the match, which can be searched and changed before anything
 * happens. Nothing is written here. The CSV goes through the importer's own
 * check and preview, the same as a pasted one, so a misread price is seen
 * before it is saved, and changing the venue checks it again.
 */
export function MenuReaderPanel({
  venues,
  disabled,
  onCsv,
}: {
  venues: { id: string; name: string }[];
  disabled: boolean;
  /** The CSV, and what the reader wants said above the importer's own report. */
  onCsv: (csv: string, notes: string[]) => void | Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<MenuReadResponse | null>(null);
  const [venue, setVenue] = useState("");

  const sorted = [...venues].sort((a, b) => a.name.localeCompare(b.name));
  const chosen = venues.find((v) => v.name.toLowerCase() === venue.trim().toLowerCase()) ?? null;
  const csv = read && chosen ? menuCsv(chosen.name, read.items) : null;

  // A venue settled on, or changed: the rows go to the importer's check under it.
  useEffect(() => {
    if (!read || !chosen || !csv) return;
    const unsure = read.items.filter((i) => i.unsure).map((i) => `${i.name} (GHS ${i.price_ghs})`);
    void onCsv(csv, [
      `Read ${read.items.length} item${read.items.length === 1 ? "" : "s"} with ${read.model} for ${chosen.name}. Check every price against the photo before importing.`,
      ...(unsure.length ? [`The reader wasn't sure of: ${unsure.join("; ")}.`] : []),
      ...(read.skipped.length ? [`Left out, no readable price: ${read.skipped.join("; ")}. Add them by hand if you know the price.`] : []),
      ...(read.chargesNotes.length
        ? [`The menu says: "${read.chargesNotes.join(" ")}" Set the venue's charges on its page if they aren't already.`]
        : []),
      "",
    ]);
    // onCsv is the parent's and changes every render; the read and the venue are what matter.
  }, [read, chosen?.id]);

  async function doRead() {
    setBusy(true);
    setError(null);
    setRead(null);
    const r = await readMenuFiles(files);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setRead(r.data);
    // The name on the menu, matched to the catalogue, unless a venue is already chosen.
    if (!chosen) {
      const guess = r.data.venueName ? guessVenue(r.data.venueName, venues) : null;
      setVenue(guess?.name ?? "");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-line p-4">
      <div className="text-[15px] font-semibold text-cocoa">Read a menu from photos, a PDF or a spreadsheet</div>
      <div className="mt-1 text-[13px] text-mutedbrown">
        Up to 6 files at a time. Pick the files, read them, then confirm the venue. The rows go through the usual check
        below; nothing is saved until you import.
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <label className="btn2 btnsm inline-flex w-fit cursor-pointer px-5">
          {files.length ? `${files.length} file${files.length === 1 ? "" : "s"} chosen` : "Choose photos or files"}
          <input
            type="file"
            multiple
            accept="image/*,.pdf,application/pdf,.csv,text/csv,.txt"
            className="hidden"
            disabled={busy || disabled}
            onChange={(e) => {
              setFiles([...(e.target.files ?? [])].slice(0, 6));
              setRead(null);
              e.target.value = "";
            }}
          />
        </label>

        <button className="btn btnsm px-6" disabled={busy || disabled || !files.length} onClick={() => void doRead()}>
          {busy ? "Reading the menu…" : read ? "Read again" : "Read it"}
        </button>
      </div>

      {read ? (
        <div className="mt-3">
          <label className="text-[13px] font-semibold text-cocoa">Which venue is this?</label>
          {read.venueName ? (
            <span className="ml-2 text-[12.5px] text-mutedbrown">The menu says &ldquo;{read.venueName}&rdquo;</span>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <input
              className="inp h-[42px] max-w-[340px]"
              list="menu-reader-venues"
              placeholder="Type to search venues…"
              value={venue}
              disabled={busy || disabled}
              onChange={(e) => setVenue(e.target.value)}
            />
            <datalist id="menu-reader-venues">
              {sorted.map((v) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
            {chosen ? (
              <span className="text-[13px] font-semibold text-[#15803D]">✓ {chosen.name}</span>
            ) : venue.trim() ? (
              <span className="text-[13px] text-mutedbrown">Keep typing and pick one from the list</span>
            ) : null}
            {csv ? (
              <button
                className="text-[13px] font-semibold text-mutedbrown hover:text-flame"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                  a.download = `${chosen!.name.replace(/[^\w-]+/g, "-").toLowerCase()}-menu.csv`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                Download CSV
              </button>
            ) : null}
          </div>
          <div className="mt-1 text-[12.5px] text-mutedbrown">
            {read.items.length} item{read.items.length === 1 ? "" : "s"} read. {chosen ? "Checked below." : "Choose the venue to check them."}
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-2 text-[13px] font-semibold text-flame">{error}</div> : null}
    </div>
  );
}
