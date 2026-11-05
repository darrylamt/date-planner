/**
 * Events offered in every plan that can reach them in time, whatever the
 * vibe or area asked for (owner, 5 Nov 2026: "I want it to show up
 * regardless of the vibe... it should be offered but can be swapped away").
 * Pulled into the shortlist like a cinema (matching.ts), first in line for
 * the evening's event (planner.ts), and never skipped as too loud for a date.
 * An ordinary stop otherwise: swappable like any other. Take an id out once
 * its night is over.
 */
export const SPOTLIGHT_EVENT_IDS: ReadonlySet<string> = new Set([
  // Friday Night Footy, rugby league finals, 6 Nov 2026: the owner plays in it.
  "6ad34846-d674-41af-9f12-dc6f61e52145",
]);
