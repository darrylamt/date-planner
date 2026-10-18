import type { Venue } from "./types";

/**
 * A venue's vibe at a particular time of day.
 *
 * Plenty of places are two places: a café by day that is a cocktail bar by
 * night, a beach club that is quiet at lunch and loud at ten. One energy tag
 * could only say one of those, and whichever it said, a plan at the other end
 * of the day got the wrong room.
 *
 * vibe_tags describe the place in the evening, when most plans happen.
 * day_energy, where it is set, is how it feels before DAY_ENDS: the evening's
 * energy (and any dancing, which is a night thing) gives way to it. Venues
 * that feel the same all day leave it null and are unaffected.
 */
export const ENERGIES = ["calm", "chill", "lively"] as const;
export type Energy = (typeof ENERGIES)[number];

/** Minutes after midnight when the evening starts: about sunset in Accra. */
export const DAY_ENDS = 18 * 60;

/** True for a time that falls in the day, given minutes after midnight (may run past 24h). */
export function isDaytime(minutes: number): boolean {
  const m = ((minutes % 1440) + 1440) % 1440;
  // Before six in the morning is still last night.
  return m >= 6 * 60 && m < DAY_ENDS;
}

/** The tags that hold at this minute of the day. */
export function vibeTagsAt(v: Pick<Venue, "vibe_tags"> & { day_energy?: string | null }, minutes: number): string[] {
  const tags = v.vibe_tags ?? [];
  const day = v.day_energy;
  if (!day || !isDaytime(minutes)) return tags;
  return [...tags.filter((t) => t !== "dancing" && !(ENERGIES as readonly string[]).includes(t)), day];
}

/** The venue as it is at this minute: same row, its tags for the time. */
export function venueAt<V extends Venue>(v: V, minutes: number): V {
  return v.day_energy ? { ...v, vibe_tags: vibeTagsAt(v, minutes) } : v;
}

/** Every tag the venue carries at some point in a window, for a shortlist that should not miss it. */
export function vibeTagsDuring(v: Venue, startMinutes: number, lengthMinutes: number): string[] {
  if (!v.day_energy) return v.vibe_tags ?? [];
  const out = new Set<string>();
  for (let m = startMinutes; m <= startMinutes + lengthMinutes; m += 30) {
    for (const t of vibeTagsAt(v, m)) out.add(t);
  }
  return Array.from(out);
}
