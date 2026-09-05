/**
 * MIRRORED from the web app: ../../src/lib/format.ts
 * Pure domain logic with no web dependencies — kept byte-identical so the
 * two clients agree on shapes and formatting. Edit the web copy first,
 * then copy it here.
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

export function randomSlug(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
