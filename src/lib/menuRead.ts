/**
 * The browser's half of reading pictures with Gemini (src/lib/gemini.ts):
 * shrinking a photo to send, the menu rows the reader returns, and the menu
 * CSV the importer takes. Shared by the admin import, the venue portal's
 * menu page and the poster readers.
 */

export type ReadItem = {
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

export type MenuReadResponse = {
  items: ReadItem[];
  chargesNotes: string[];
  skipped: string[];
  deliveryApp: boolean;
  venueName: string;
  model: string;
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
 * A photo the size it needs to be read, not the size a phone takes it.
 *
 * A Vercel function takes about 4.5 MB a request, and a phone photo alone is
 * often more. 1800 pixels on the long side keeps small print legible. A
 * format the browser cannot draw (HEIC outside Safari) goes as it is.
 */
export async function shrink(file: File, longSide = 1800): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, longSide / Math.max(bmp.width, bmp.height));
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

/** Send menu files to /api/ai/menu, shrunk. */
export async function readMenuFiles(files: File[]): Promise<{ ok: true; data: MenuReadResponse } | { ok: false; error: string }> {
  const form = new FormData();
  for (const f of files) {
    const blob = await shrink(f);
    form.append("files", blob, blob === f ? f.name : f.name.replace(/\.\w+$/, "") + ".jpg");
  }
  try {
    const res = await fetch("/api/ai/menu", { method: "POST", body: form });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.items) return { ok: false, error: json?.error ?? "That didn't go through. Try again." };
    if (json.deliveryApp) {
      return {
        ok: false,
        error: "That looks like a delivery app (Bolt Food, Glovo…). Their prices are marked up, so they don't go in as menu prices. Use the venue's own menu.",
      };
    }
    return { ok: true, data: json as MenuReadResponse };
  } catch {
    return { ok: false, error: "That didn't go through. Check your connection and try again." };
  }
}

/** The venue a menu names, matched to the catalogue: exact, then the closest containing match. */
export function guessVenue<T extends { name: string }>(printed: string, venues: T[]): T | null {
  const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
  const p = norm(printed);
  if (p.length < 3) return null;
  const exact = venues.find((v) => norm(v.name) === p);
  if (exact) return exact;
  const near = venues
    .filter((v) => norm(v.name).includes(p) || p.includes(norm(v.name)))
    .sort((a, b) => Math.abs(norm(a.name).length - p.length) - Math.abs(norm(b.name).length - p.length));
  return near[0] ?? null;
}
