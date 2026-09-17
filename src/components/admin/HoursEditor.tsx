"use client";

import { alwaysOpenPeriods, isAlwaysOpen, parsePeriods, type OpeningPeriod } from "@/lib/hours";

/**
 * Opening hours, by hand.
 *
 * These used to be fetched from Google and shown read-only, on the reasoning
 * that a hand-typed copy of somebody else's hours goes stale silently. That
 * held until the catalogue filled with places Google has no hours for at all:
 * twelve of them after the backfill, and every one unguarded, so a plan could
 * send somebody to a locked door with nothing to stop it. Read-only is only a
 * safe default while there is something to read.
 *
 * Google still wins where it has an answer. This is for the rest.
 *
 * ── one window a day ────────────────────────────────────────────────────
 * A venue that shuts for the afternoon and reopens has two periods on that
 * day, and this grid holds one. Rather than silently flatten it, a day like
 * that is left exactly as Google sent it until somebody edits that row, and
 * the note below says so. Losing a lunch break by opening a form and pressing
 * save would be the worst kind of quiet.
 */
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface DayHours {
  /** Shut all day. The absence of a period, said out loud. */
  closed: boolean;
  open: string;
  close: string;
  /** Google gave this day more than one window, so the grid will not touch it. */
  split: boolean;
}

function clock(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Periods into a week of rows, one per day. */
export function weekFrom(raw: unknown): DayHours[] {
  const periods = parsePeriods(raw) ?? [];
  return DAYS.map((_, day) => {
    const mine = periods.filter((p) => p.open.day === day);
    if (!mine.length) return { closed: true, open: "09:00", close: "22:00", split: false };

    const first = mine[0];
    return {
      closed: false,
      open: clock(first.open.hour, first.open.minute),
      // No close means open around the clock from then, which the grid shows
      // as midnight to midnight rather than as a blank nobody can interpret.
      close: first.close ? clock(first.close.hour, first.close.minute) : "00:00",
      split: mine.length > 1,
    };
  });
}

/** Rows back into periods. */
export function periodsFrom(week: DayHours[], original: unknown): OpeningPeriod[] | null {
  const existing = parsePeriods(original) ?? [];
  const out: OpeningPeriod[] = [];

  week.forEach((d, day) => {
    // A day Google split is carried over untouched, whatever the grid shows.
    if (d.split) {
      out.push(...existing.filter((p) => p.open.day === day));
      return;
    }
    if (d.closed) return;

    const [oh, om] = d.open.split(":").map(Number);
    const [ch, cm] = d.close.split(":").map(Number);
    out.push({
      open: { day, hour: oh || 0, minute: om || 0 },
      close: { day, hour: ch || 0, minute: cm || 0 },
    });
  });

  // No open day at all is "we know it is never open", which is a real claim
  // and a different one from null. Nothing in this form should make it by
  // accident, so an empty week reads as unknown instead.
  return out.length ? out : null;
}

export function HoursEditor({
  raw,
  onChange,
}: {
  raw: unknown;
  onChange: (periods: OpeningPeriod[] | null) => void;
}) {
  const always = isAlwaysOpen(parsePeriods(raw));
  const week = weekFrom(raw);
  const hasSplit = week.some((d) => d.split);

  const setDay = (day: number, patch: Partial<DayHours>) => {
    const next = week.map((d, i) => (i === day ? { ...d, ...patch } : d));
    onChange(periodsFrom(next, raw));
  };

  return (
    <div className="md:col-span-2">
      <span className="flbl">Opening hours</span>

      <label className="mt-1 flex cursor-pointer items-center gap-2 text-[14px] font-semibold">
        <input
          type="checkbox"
          checked={always}
          onChange={(e) => onChange(e.target.checked ? alwaysOpenPeriods() : null)}
        />
        Always open, no closing time
      </label>
      <span className="mt-1 block text-[12px] text-mutedbrown">
        For somewhere with no door to lock: a beach, a park, a stretch of shore.
      </span>

      {!always && (
        <>
          <div className="mt-3 rounded-bar border border-line bg-cream/50 p-3">
            {week.map((d, day) => (
              <div key={DAYS[day]} className="flex flex-wrap items-center gap-2 py-1">
                <span className="w-[86px] shrink-0 text-[13px] text-mutedbrown">{DAYS[day]}</span>

                <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={d.closed}
                    disabled={d.split}
                    onChange={(e) => setDay(day, { closed: e.target.checked })}
                  />
                  Closed
                </label>

                {!d.closed && (
                  <>
                    <input
                      type="time"
                      className="inp h-[34px] w-[108px] font-mono"
                      value={d.open}
                      disabled={d.split}
                      onChange={(e) => setDay(day, { open: e.target.value })}
                    />
                    <span className="text-mutedbrown">to</span>
                    <input
                      type="time"
                      className="inp h-[34px] w-[108px] font-mono"
                      value={d.close}
                      disabled={d.split}
                      onChange={(e) => setDay(day, { close: e.target.value })}
                    />
                  </>
                )}

                {d.split && (
                  <span className="text-[12px] text-mutedbrown">
                    two windows from Google, left as they are
                  </span>
                )}
              </div>
            ))}
          </div>

          <span className="mt-1 block text-[12px] text-mutedbrown">
            A closing time at or before the opening one runs into the next day, so a bar open
            until 2am is 21:00 to 02:00.
            {hasSplit
              ? " Days with two windows are shown locked, because this grid holds one a day and flattening them would quietly lose the break."
              : ""}
          </span>
        </>
      )}
    </div>
  );
}
