"use client";

import { useState } from "react";

type ReadItem = {
  name: string;
  category: string;
  price_ghs: number;
  notes?: string;
  covers_people?: number;
  alcoholic?: string;
  dietary?: string;
  days?: string;
  from?: string;
  to?: string;
  min_players?: number;
  max_players?: number;
  duration_minutes?: number;
  min_age?: number;
  requires_gear?: string;
  unsure?: boolean;
};

const HEADERS = [
  "venue", "name", "category", "price_ghs", "notes", "covers_people",
  "min_players", "max_players", "duration_minutes", "min_age", "requires_gear",
  "days", "from", "to", "alcoholic", "dietary",
];
/** A count the reader filled with 0 for "not said" is left blank. */
const n = (v: number | undefined) => (v && v > 0 ? v : "");

function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The rows as the importer's menu CSV, for one venue. */
export function menuCsv(venue: string, items: ReadItem[]): string {
  const lines = items.map((i) =>
    [
      venue, i.name, i.category, i.price_ghs, i.notes ?? "", i.covers_people && i.covers_people > 1 ? i.covers_people : "",
      n(i.min_players), n(i.max_players), n(i.duration_minutes), n(i.min_age), i.requires_gear ?? "",
      i.days ?? "", i.from ?? "", i.to ?? "", i.alcoholic ?? "", i.dietary ?? "",
    ]
      .map(cell)
      .join(",")
  );
  return [HEADERS.join(","), ...lines].join("\n");
}

/**
 * A photo the size a menu needs to be read, not the size a phone takes it.
 *
 * A Vercel function takes about 4.5 MB a request, and a phone photo alone is
 * often more. 1800 pixels on the long side keeps small print legible. A
 * format the browser cannot draw (HEIC outside Safari) goes as it is.
 */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Read a menu from photos, a PDF or an untidy spreadsheet (/api/admin/menu-read,
 * Gemini's free tier), and hand the importer a CSV to check.
 *
 * Nothing is written here. The CSV goes through the importer's own check and
 * preview, the same as a pasted one, so a misread price is seen before it is
 * saved. It can also be downloaded, to fix in a spreadsheet first.
 */
export function MenuReaderPanel({
  venues,
  disabled,
  onCsv,
}: {
  venues: { id: string; name: string }[];
  disabled: boolean;
  /** The CSV, and what the reader wants said above the importer's own report. */
  onCsv: (csv: string, notes: string[]) => void;
}) {
  const [venue, setVenue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCsv, setLastCsv] = useState<string | null>(null);

  async function read() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const f of files) {
        const blob = await shrink(f);
        form.append("files", blob, blob === f ? f.name : f.name.replace(/\.\w+$/, "") + ".jpg");
      }
      const res = await fetch("/api/admin/menu-read", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.items) {
        setError(json?.error ?? "That didn't go through. Try again.");
        return;
      }
      // Delivery-app prices are marked up and never become menu rows.
      if (json.deliveryApp) {
        setError("That looks like a delivery app (Bolt Food, Glovo…). Their prices are marked up, so they don't go in as menu prices. Use the venue's own menu.");
        return;
      }
      const items = json.items as ReadItem[];
      const csv = menuCsv(venue, items);
      setLastCsv(csv);
      const unsure = items.filter((i) => i.unsure).map((i) => `${i.name} (GHS ${i.price_ghs})`);
      const notes = [
        `Read ${items.length} item${items.length === 1 ? "" : "s"} with ${json.model}. Check every price against the photo before importing.`,
        ...(unsure.length ? [`The reader wasn't sure of: ${unsure.join("; ")}.`] : []),
        ...(json.skipped?.length
          ? [`Left out, no readable price: ${(json.skipped as string[]).join("; ")}. Add them by hand if you know the price.`]
          : []),
        ...(json.chargesNotes?.length
          ? [`The menu says: "${(json.chargesNotes as string[]).join(" ")}" Set the venue's charges on its page if they aren't already.`]
          : []),
        "",
      ];
      onCsv(csv, notes);
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-line p-4">
      <div className="text-[15px] font-semibold text-cocoa">Read a menu from photos, a PDF or a spreadsheet</div>
      <div className="mt-1 text-[13px] text-mutedbrown">
        Up to 6 files at a time. The rows land in the box below as a CSV and go through the usual check; nothing is saved
        until you import.
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <select className="inp max-w-[280px]" value={venue} disabled={busy || disabled} onChange={(e) => setVenue(e.target.value)}>
          <option value="">Which venue?</option>
          {[...venues].sort((a, b) => a.name.localeCompare(b.name)).map((v) => (
            <option key={v.id} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>

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
              e.target.value = "";
            }}
          />
        </label>

        <button className="btn btnsm px-6" disabled={busy || disabled || !venue || !files.length} onClick={() => void read()}>
          {busy ? "Reading the menu…" : "Read it"}
        </button>

        {lastCsv ? (
          <button
            className="text-[13px] font-semibold text-mutedbrown hover:text-flame"
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([lastCsv], { type: "text/csv" }));
              a.download = `${venue.replace(/[^\w-]+/g, "-").toLowerCase() || "menu"}-menu.csv`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Download CSV
          </button>
        ) : null}
      </div>

      {error ? <div className="mt-2 text-[13px] font-semibold text-flame">{error}</div> : null}
    </div>
  );
}
