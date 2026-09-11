import type { Occasion } from "./types";

/**
 * Turning saved plans into something a month grid can draw.
 *
 * The only real decision here is recurrence. A birthday and an anniversary
 * are the same date every year and stay worth seeing; a date night on the
 * 14th of March is one evening and means nothing on the 14th of March next
 * year. Treating all of them alike would either bury the recurring ones after
 * they pass or litter the calendar with dead ones.
 */
export const RECURRING: Occasion[] = ["birthday", "anniversary"];

export interface CalendarEntry {
  id: string;
  slug: string;
  title: string;
  occasion: Occasion;
  /** The date this entry sits on, already shifted for a recurring occasion. */
  date: string;
  /** The date the plan was actually made for. */
  originalDate: string;
  recurring: boolean;
  /** Years since the original, for a recurring entry. 0 on the first. */
  yearsSince: number;
  total: number;
}

export function isRecurring(occasion: Occasion): boolean {
  return RECURRING.includes(occasion);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Midnight local, so comparisons are not thrown by the current time of day. */
export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Where a plan should appear, given the month being looked at.
 *
 * A recurring occasion is projected onto the year in view. A one-off stays
 * exactly where it happened. The 29th of February falls back to the 28th in
 * a common year rather than silently jumping into March.
 */
export function occurrenceFor(
  entryDate: string,
  occasion: Occasion,
  year: number
): { date: string; yearsSince: number } {
  const original = parseISO(entryDate);
  if (!isRecurring(occasion)) {
    return { date: entryDate, yearsSince: 0 };
  }

  const month = original.getMonth();
  const day = original.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(day, daysInMonth);

  return {
    date: iso(new Date(year, month, safeDay)),
    yearsSince: Math.max(0, year - original.getFullYear()),
  };
}

/** The days of a month grid, padded to whole weeks starting Monday. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // getDay is Sunday-first; Accra weeks start Monday.
  const lead = (first.getDay() + 6) % 7;

  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(iso(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** "in 3 days", "today", "2 years ago". Short enough to sit on a row. */
export function relativeDay(dateISO: string): string {
  const days = Math.round(
    (parseISO(dateISO).getTime() - today().getTime()) / 86400000
  );
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) {
    if (days < 7) return `in ${days} days`;
    if (days < 31) return `in ${Math.round(days / 7)} weeks`;
    if (days < 365) return `in ${Math.round(days / 30)} months`;
    return `in ${Math.round(days / 365)} years`;
  }
  const ago = Math.abs(days);
  if (ago < 7) return `${ago} days ago`;
  if (ago < 31) return `${Math.round(ago / 7)} weeks ago`;
  if (ago < 365) return `${Math.round(ago / 30)} months ago`;
  return `${Math.round(ago / 365)} years ago`;
}
