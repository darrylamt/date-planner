import type { Itinerary, PlanInputs } from "./types";

/**
 * A plan's stops on the phone's clock: when each is reached and left.
 *
 * Stops carry their arrival as "8:30 PM" and a length in minutes, and the
 * plan carries the day. A late night runs into the next day, so a time
 * earlier than the one before it is taken as after midnight. Shared by the
 * Live Activity and "Where next?", which both need to know where the night
 * has got to.
 */
export type TimedStop = { index: number; name: string; time: string; arrive: number; leave: number };

/** "8:30 PM" → minutes past midnight. */
export function minutesOf(label: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(label.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

export function stopTimes(inputs: PlanInputs, itinerary: Itinerary): TimedStop[] | null {
  const [y, mo, d] = (inputs.date ?? "").split("-").map(Number);
  if (!y || !mo || !d) return null;
  const out: TimedStop[] = [];
  let dayShift = 0;
  let prev = -1;
  for (const [index, s] of (itinerary.stops ?? []).entries()) {
    const mins = minutesOf(s.arrival_time);
    if (mins == null) return null;
    if (prev >= 0 && mins < prev) dayShift += 1;
    prev = mins;
    const arrive = new Date(y, mo - 1, d + dayShift, Math.floor(mins / 60), mins % 60).getTime();
    out.push({ index, name: s.name, time: s.arrival_time, arrive, leave: arrive + Math.max(15, s.duration_mins || 60) * 60_000 });
  }
  return out.length ? out : null;
}

/**
 * Where the night is at `now`, for "Where next?": the stop it has reached
 * (or is about to), and the time they would be setting off from it. Null
 * outside the night: from six hours before the first stop, the same as
 * following it on the Lock Screen, until three hours after the last one
 * ends. It was three hours before, and a plan could offer to be followed
 * without offering "Where next?" beside it.
 */
export function whereTheNightIs(
  inputs: PlanInputs,
  itinerary: Itinerary,
  now = Date.now()
): { anchor: number; date: string; time: string } | null {
  const stops = stopTimes(inputs, itinerary);
  if (!stops) return null;
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (now < first.arrive - 6 * 3_600_000 || now > last.leave + 3 * 3_600_000) return null;
  // The stop under way, or the last one reached; before the night, the first.
  const reached = [...stops].reverse().find((s) => s.arrive <= now) ?? first;
  const setOff = Math.max(now, reached.leave);
  const at = new Date(setOff);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    anchor: reached.index,
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}

/** "tonight", "today" or "this plan": what to call it, from when it starts. */
export function whenWord(inputs: PlanInputs, itinerary: Itinerary, now = new Date()): string {
  const first = stopTimes(inputs, itinerary)?.[0];
  if (!first) return "this plan";
  const start = new Date(first.arrive);
  if (start.getHours() >= 17) return "tonight";
  return start.toDateString() === now.toDateString() ? "today" : "this plan";
}
