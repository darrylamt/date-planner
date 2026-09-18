import { saveDraft } from "./draft";
import { stepsFor } from "./planConstants";
import type { SavedPlan } from "./types";

/**
 * Start a new plan from an old one.
 *
 * Shared by the saved list and the plan viewer, because both offer it and two
 * copies of this would drift on the one detail that matters: which date the
 * new plan starts from.
 *
 * Tomorrow, not the original date. Carrying the old one over means repeating
 * last month's evening on last month's date, which nobody means, and a stale
 * date sitting in a filled form is only noticed after the plan comes back
 * empty because everywhere was shut. Tomorrow is a real answer they can change
 * in one tap.
 *
 * Opens on the date question rather than at the start: every other answer is
 * already theirs, and this is the one that has to change.
 *
 * The venues are re-picked rather than copied, because a Saturday plan
 * repeated on a Monday can land on a locked door.
 */
export async function draftFromPlan(plan: SavedPlan): Promise<void> {
  const { inputs } = plan;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const steps = stepsFor(inputs.occasion, false);
  const whenAt = Math.max(0, steps.indexOf("when"));

  await saveDraft({
    inputs: { ...inputs, date: tomorrow.toISOString().slice(0, 10) },
    itinerary: null,
    shareSlug: null,
    step: whenAt,
  });
}
