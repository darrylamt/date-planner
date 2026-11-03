import type { Look } from "../../lib/looks";

/** The colours stops take in turn: on the map's pins, the reveal's blocks and the plan's cards. */
export function stopColours(look: Look) {
  return [
    { bg: look.primary, fg: look.onPrimary },
    { bg: look.second, fg: look.onSecond },
    { bg: look.third, fg: look.onThird },
  ];
}
