import { weekdayOf } from "./hours";
import type { VenueSchedule } from "./types";

/**
 * Whether a weekly fixture is actually on while somebody is there.
 *
 * Karaoke that starts at nine is no use to a table booked for six and gone by
 * eight, and a plan that boasted about it would be selling an evening nobody
 * got. So the question is never "does this venue do karaoke on Thursdays" but
 * "does it overlap the visit", and only an overlap is worth mentioning.
 *
 * The overnight convention is borrowed rather than reinvented: an end at or
 * before the start runs into the next day, exactly as an opening period does
 * in hours.ts. Karaoke from 21:00 to 01:00 is one fixture, and a visit
 * arriving at 23:30 on Thursday is inside it.
 */
const DAY = 1440;
const WEEK = 7 * DAY;

/** Absolute minute in the week, Sunday 00:00 being zero. */
function absolute(weekday: number, minute: number): number {
  return weekday * DAY + minute;
}

function windowOf(s: VenueSchedule): [number, number] {
  const from = absolute(s.weekday, s.starts_minute);
  let to = absolute(s.weekday, s.ends_minute);
  // Ends at or before it starts, so it runs into the following day.
  if (to <= from) to += DAY;
  return [from, to];
}

/**
 * The fixtures on while a visit is in progress.
 *
 * Both the visit and the fixture are tested in this week's copy and the one
 * before, so a Saturday-night fixture still covers a visit that began on
 * Saturday and runs into Sunday.
 */
export function schedulesDuring(
  schedules: VenueSchedule[],
  dateISO: string,
  startMinute: number,
  durationMinutes: number
): VenueSchedule[] {
  const weekday = weekdayOf(dateISO);
  if (weekday === null || !schedules.length) return [];

  const visitFrom = absolute(weekday, startMinute);
  const visitTo = visitFrom + Math.max(1, durationMinutes);

  return schedules.filter((s) => {
    if (!s.is_active) return false;
    const [from, to] = windowOf(s);
    // Overlap, in either copy of the week.
    return (
      (visitFrom < to && visitTo > from) ||
      (visitFrom + WEEK < to && visitTo + WEEK > from)
    );
  });
}

/** Everything a venue does on a given date, whether or not it overlaps. */
export function schedulesOnDate(schedules: VenueSchedule[], dateISO: string): VenueSchedule[] {
  const weekday = weekdayOf(dateISO);
  if (weekday === null) return [];
  return schedules.filter((s) => s.is_active && s.weekday === weekday);
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function clock(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "Karaoke, Thursdays 19:00 to 22:00", for a card or an admin table. */
export function describeSchedule(s: VenueSchedule): string {
  const cover = s.cover_ghs ? `, GHS ${Math.round(Number(s.cover_ghs))} in` : "";
  return `${s.title}, ${DAY_NAMES[s.weekday]}s ${clock(s.starts_minute)} to ${clock(s.ends_minute)}${cover}`;
}

export { DAY_NAMES };
