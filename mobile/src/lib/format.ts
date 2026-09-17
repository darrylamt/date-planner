/**
 * GENERATED, do not edit. Mirrored from src/lib/format.ts.
 *
 * Run `npm run mirror` after changing the web copy.
 */
/** Formatting helpers shared across screens. */

export function ghs(n: number): string {
  return `GHS ${Math.round(n).toLocaleString("en-GH")}`;
}

/** "2026-07-18" → "Saturday, 18 July" */
export function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** "2026-07-18" → "Sat, 18 July" */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });
}

/** "17:30" → "5:30 PM" */
export function time12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const am = h < 12;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

/** Add minutes to "HH:MM", return "H:MM AM/PM". */
export function addMins12(t: string, mins: number): string {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return time12(`${hh}:${String(mm).padStart(2, "0")}`);
}

/**
 * A venue's Instagram handle as a link, or null when there is nothing to link.
 *
 * Handles reach the catalogue three ways: "@name" is what every row currently
 * holds, "name" is what somebody types when they leave the @ off, and a whole
 * profile URL is what happens when the field is filled by pasting. All three
 * reduce to the username.
 *
 * Validated rather than trusted, because the alternative to returning null is
 * an action on the card that opens a page which does not exist. A handle that
 * does not look like a handle is treated as one nobody has recorded, which is
 * how every other unfilled field in this catalogue behaves.
 */
export function instagramUrl(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const name = handle
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .trim();
  if (!/^[A-Za-z0-9._]{1,30}$/.test(name)) return null;
  return `https://instagram.com/${name}`;
}

export function randomSlug(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
