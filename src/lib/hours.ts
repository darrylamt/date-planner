/**
 * When a venue is actually open.
 *
 * The planner could always pick a good restaurant in the right area at the
 * right price and still send someone to a locked door. Bliss Family
 * Entertainment is shut every Monday; nothing in the catalogue knew that, so a
 * Monday plan would have named it, priced it, and routed a taxi to it.
 *
 * Stored in Google's own shape rather than a tidier one of our own. Their
 * periods already handle the two things that make opening hours awkward,
 * closing after midnight and being shut on a given day entirely, and any
 * reshaping on the way in is a chance to lose one of them.
 */
export interface DayTime {
  /** 0 is Sunday, matching both Google and JavaScript's getDay(). */
  day: number;
  hour: number;
  minute: number;
}

export interface OpeningPeriod {
  open: DayTime;
  /** Absent means open around the clock from `open` onwards. */
  close?: DayTime;
}

const WEEK = 7 * 1440;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function absolute(t: DayTime): number {
  return t.day * 1440 + t.hour * 60 + t.minute;
}

/** Google sends these as loose JSON; anything malformed is treated as unknown. */
export function parsePeriods(raw: unknown): OpeningPeriod[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const periods: OpeningPeriod[] = [];
  for (const p of raw) {
    const open = (p as OpeningPeriod)?.open;
    if (
      !open ||
      typeof open.day !== "number" ||
      typeof open.hour !== "number" ||
      typeof open.minute !== "number"
    ) {
      continue;
    }
    periods.push(p as OpeningPeriod);
  }
  return periods.length ? periods : null;
}

/**
 * Every window the venue is open, as minutes from Sunday 00:00.
 *
 * A window that runs past the end of the week is not wrapped back round to
 * zero, it is left running past 10080 and tested against both this week's and
 * last week's copy of the moment. Wrapping it would split one continuous
 * Saturday night into two windows and lose the join.
 */
function windows(periods: OpeningPeriod[]): [number, number][] {
  return periods.map((p) => {
    const from = absolute(p.open);
    if (!p.close) return [from, from + 1440] as [number, number];
    let to = absolute(p.close);
    // Closing at or before opening means it runs into the following day.
    if (to <= from) to += WEEK;
    return [from, to] as [number, number];
  });
}

/**
 * Is the venue open at this moment?
 *
 * Null when the hours are not known, which is not the same as closed and must
 * not be treated as either. Most of the catalogue has no hours on file yet, so
 * reading "unknown" as "shut" would empty a plan, and reading it as "open" is
 * the assumption that was already being made.
 */
export function isOpenAt(
  periods: OpeningPeriod[] | null | undefined,
  weekday: number,
  minuteOfDay: number
): boolean | null {
  if (!periods || !periods.length) return null;

  const target = weekday * 1440 + minuteOfDay;
  for (const [from, to] of windows(periods)) {
    // Both copies, so a window opened last Saturday still covers Sunday 01:00.
    if ((target >= from && target < to) || (target + WEEK >= from && target + WEEK < to)) {
      return true;
    }
  }
  return false;
}

/**
 * Open for the whole visit, not merely at the moment of arrival.
 *
 * Arriving twenty minutes before closing is worse than being told the place is
 * shut: you have paid for a taxi to somewhere that will turn you out. Checked
 * at both ends and at every half hour between, because a venue that shuts for
 * an afternoon break would otherwise pass on its two endpoints.
 */
export function isOpenThroughout(
  periods: OpeningPeriod[] | null | undefined,
  weekday: number,
  startMinute: number,
  durationMinutes: number
): boolean | null {
  if (!periods || !periods.length) return null;

  /*
   * The last moment checked is the minute before the end, not the end itself.
   * Leaving at closing time is exactly what closing time means: a venue that
   * shuts at 21:00 is fine for a visit ending at 21:00, and testing the
   * closing instant marked every such venue shut and quietly shrank the
   * catalogue for any slot that happened to end on the hour.
   */
  const last = Math.max(0, durationMinutes - 1);
  for (let offset = 0; ; offset += 30) {
    const at = startMinute + Math.min(offset, last);
    const day = (weekday + Math.floor(at / 1440)) % 7;
    if (isOpenAt(periods, day, at % 1440) === false) return false;
    if (offset >= last) break;
  }
  return true;
}

/** Weekday of an ISO date, read as a local calendar date rather than UTC. */
export function weekdayOf(dateISO: string): number | null {
  const [y, m, d] = dateISO.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getDay();
}

/** True when the venue does not open at all on that weekday. */
export function closedAllDay(
  periods: OpeningPeriod[] | null | undefined,
  weekday: number
): boolean {
  if (!periods || !periods.length) return false;
  for (let minute = 0; minute < 1440; minute += 30) {
    if (isOpenAt(periods, weekday, minute)) return false;
  }
  return true;
}

function clock(t: DayTime): string {
  return `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}

/** One day's hours in a form an admin can check against a poster at a glance. */
export function describeDay(
  periods: OpeningPeriod[] | null | undefined,
  weekday: number
): string {
  if (!periods || !periods.length) return "not known";

  const today = periods.filter((p) => p.open.day === weekday);
  if (!today.length) return "closed";

  return today
    .map((p) => {
      if (!p.close) return `${clock(p.open)} onwards`;
      const overnight = p.close.day !== p.open.day;
      const to = p.close.hour === 0 && p.close.minute === 0 ? "midnight" : clock(p.close);
      return `${clock(p.open)} to ${to}${overnight && to !== "midnight" ? " next day" : ""}`;
    })
    .join(", ");
}

/** The whole week, for the venue form. */
export function describeWeek(
  periods: OpeningPeriod[] | null | undefined
): { day: string; hours: string }[] {
  return DAY_NAMES.map((day, i) => ({ day, hours: describeDay(periods, i) }));
}
