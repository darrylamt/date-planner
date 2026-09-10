import type { Occasion, PlanInputs } from "./types";

/**
 * What the mascot says while a plan is being built.
 *
 * Per occasion, because the same three lines under every costume made the
 * costume feel like a skin rather than a character. Kept short, these are
 * read at a glance during a 25 second wait, not studied.
 *
 * Nothing here may claim anything about the plan that is not certain: the
 * itinerary does not exist yet while these are on screen.
 */
const LINES: Record<Occasion, string[]> = {
  first_date: [
    "First dates want easy exits and good talking spots.",
    "Somewhere you can actually hear each other…",
    "Nothing too grand. Grand is for later.",
  ],
  anniversary: [
    "This one matters. Let me take my time.",
    "Looking for somewhere worth the occasion…",
    "Something you will still talk about next year.",
  ],
  date_night: [
    "Same city, somewhere new.",
    "Checking what is actually open tonight…",
    "Keeping it easy. It is a Tuesday, not a summit.",
  ],
  birthday: [
    "Right, whose day is it?",
    "Finding somewhere that will make a fuss…",
    "Cake is non-negotiable.",
  ],
  graduation: [
    "You earned this one.",
    "Somewhere that can seat the whole crowd…",
    "Photos will be taken. Planning accordingly.",
  ],
  celebration: [
    "Good news deserves a proper table.",
    "Finding somewhere with a bit of noise…",
    "Something to toast with, obviously.",
  ],
  friend_outing: [
    "No candles. Understood.",
    "Looking for somewhere that fits everyone…",
    "Good food, good noise, no fuss.",
  ],
  solo_day: [
    "A day on your own terms.",
    "Finding places that are good solo…",
    "Counter seats and somewhere to just be.",
  ],
};

export function loadingLines(inputs: PlanInputs): string[] {
  const base = LINES[inputs.occasion] ?? LINES.date_night;
  const area = inputs.surpriseMe ? "Accra" : (inputs.areaNames[0] ?? "Accra");

  // One concrete line about their actual answers, so it does not read as
  // canned copy on a loop.
  return [
    base[0],
    `Reading menus in ${area}…`,
    base[1],
    `Keeping it under GHS ${inputs.budget.toLocaleString()}…`,
    base[2],
  ];
}

/** A single greeting for the first step of each pathway. */
export const OCCASION_GREETING: Record<Occasion, string> = {
  first_date: "A first date. Let us make it easy on both of you.",
  anniversary: "An anniversary. Let us do this properly.",
  date_night: "A date night. Somewhere new, no fuss.",
  birthday: "A birthday. Who are we spoiling?",
  graduation: "A graduation. Time to celebrate properly.",
  celebration: "Something to celebrate. Let us hear it.",
  friend_outing: "Friends out. Good food, no candles.",
  solo_day: "A day to yourself. Let us make it a good one.",
};
