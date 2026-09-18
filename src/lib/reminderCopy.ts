import type { Itinerary, PlanInputs } from "./types";

/**
 * What a reminder actually says.
 *
 * ── the line this has to walk ───────────────────────────────────────────
 * A notification the night before is welcome exactly once per plan, and only
 * if it earns the interruption. "Your plan is tomorrow" does not: it tells
 * somebody a thing they already know, in the tone of a dentist's receptionist.
 *
 * So these are warm, and specific, and short. Specific is what makes them
 * warm: naming the place and the hour is both the useful part and the part
 * that sounds like a person rather than a scheduler. Nothing here is invented,
 * every word comes from the plan they built.
 *
 * ── and what it must never do ───────────────────────────────────────────
 * No exclamation marks stacked up, no "Don't forget!", no emoji shouting at a
 * lock screen. A reminder that performs excitement on somebody's behalf is
 * embarrassing to receive in public, which is where lock screens are read.
 *
 * Chosen by the plan's own shape rather than at random, so the same person
 * does not get the same sentence every month, and a first date never gets the
 * line written for a group of friends.
 */

/** A stable pick from a list, so one plan always gets the same wording. */
function pick<T>(options: T[], seed: string): T {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return options[n % options.length];
}

export interface Reminder {
  title: string;
  body: string;
}

/**
 * The evening in one line, for a lock screen.
 *
 * Two names and a time at most. A notification is read at a glance and the
 * plan is one tap away, so listing five stops makes it a paragraph nobody
 * finishes and buries the part that matters.
 */
export function reminderFor(
  inputs: PlanInputs,
  itinerary: Itinerary,
  seed: string
): Reminder {
  const stops = itinerary.stops ?? [];
  if (!stops.length) {
    return { title: "Tomorrow", body: "Your plan is tomorrow. Tap for the details." };
  }

  const first = stops[0];
  const when = first.arrival_time;
  const where = first.name;
  /*
   * Defaulted, not compared blind. Plans saved before partySize existed carry
   * no value, and `undefined <= 1` is false only by accident of how JavaScript
   * coerces: it would read as "not solo" for the right answer by the wrong
   * route, and the next comparison added here would not be so lucky. Two is
   * the shape of most plans and the safest thing to assume.
   */
  const party = Number(inputs.partySize) || 2;
  const solo = party <= 1;
  const group = party > 2;

  /*
   * The title carries the occasion, because that is the one thing the body has
   * no room for and the one thing that makes it theirs rather than generic.
   */
  const title = pick(
    titlesFor(inputs.occasion, solo, group),
    `${seed}:title`
  );

  const rest =
    stops.length === 1
      ? ""
      : stops.length === 2
        ? ` then ${stops[1].name}`
        : ` then ${stops[1].name} and ${stops.length - 2} more`;

  const body = pick(
    [
      `${where} at ${when}${rest}.`,
      `Starts at ${where}, ${when}${rest}.`,
      `${when} at ${where}${rest}.`,
    ],
    `${seed}:body`
  );

  return { title, body };
}

/**
 * Titles worth reading, by what the evening is for.
 *
 * Deliberately not one list. "Big day tomorrow" is right for a birthday and
 * faintly alarming for a first date, and a solo day should never be addressed
 * in the plural.
 */
function titlesFor(occasion: string, solo: boolean, group: boolean): string[] {
  if (solo) {
    return ["Tomorrow is yours", "Your day out, tomorrow", "Tomorrow, just you"];
  }

  switch (occasion) {
    case "first_date":
      // Light. Anything heavier is pressure on a lock screen.
      return ["Tomorrow is the day", "All set for tomorrow", "Tomorrow, then"];
    case "anniversary":
      return ["Tomorrow is the one", "The evening is set", "All ready for tomorrow"];
    case "birthday":
      return ["Big day tomorrow", "Tomorrow is the birthday", "It is all set"];
    case "graduation":
      return ["The celebration is tomorrow", "Big day tomorrow", "All set to celebrate"];
    case "celebration":
      return ["Tomorrow is the night", "All set to celebrate", "The evening is ready"];
    case "friend_outing":
      return ["Tomorrow with the crew", "The night out is tomorrow", "All set for tomorrow"];
    default:
      return group
        ? ["Tomorrow with everyone", "The evening is set", "All set for tomorrow"]
        : ["Tomorrow evening", "The evening is set", "All set for tomorrow"];
  }
}
