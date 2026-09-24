import { NextResponse } from "next/server";
import { planInputsSchema } from "@/lib/schemas";
import { fetchCandidates } from "@/lib/matching";
import {
  openOnDate,
  planItinerary,
  focusVenueTypes,
  stopCountFor,
} from "@/lib/planner";
import { fallbackCopy, writePlanCopy } from "@/lib/copy";
import { assembleItinerary } from "@/lib/itinerary";
import { createClient } from "@/lib/supabase/server";
import { BUDGET_MAX } from "@/lib/budget";
import { wellnessAllowed } from "@/lib/planConstants";
import type {
  GenerateResponse,
  Itinerary,
  PlanInputs,
} from "@/lib/types";

/**
 * Build a plan.
 *
 * Selection and arithmetic happen in planItinerary; the model is asked only
 * for the words. That removed the corrective retry loop entirely, a budget
 * cannot be exceeded by a step that never computes it, and cut the prompt
 * from the whole candidate catalogue down to the two or three chosen stops.
 */
export const maxDuration = 60;

/** Said plainly, because the shortage is ours rather than the user's. */
const FOCUS_SHORTFALL: Record<string, string> = {
  drinks: "We do not have enough priced bars in the catalog yet for a drinks-only night.",
  food: "We do not have enough priced places to eat for a food-only day just yet.",
  activities: "We do not have enough priced activities in the catalog yet for a full day of them.",
  everything: "We could not fill the whole evening.",
};

export async function POST(req: Request): Promise<NextResponse<GenerateResponse>> {
  let inputs: PlanInputs;
  try {
    inputs = planInputsSchema.parse(await req.json()) as PlanInputs;
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid plan inputs." }, { status: 400 });
  }

  const supabase = createClient();

  let candidates;
  try {
    candidates = await fetchCandidates(supabase, inputs);
  } catch (e) {
    console.error("candidate fetch failed", e);
    return NextResponse.json(
      { status: "error", message: "We couldn't reach the venue catalog." },
      { status: 500 }
    );
  }

  // Nothing in the catalog at all, blaming the user's budget here is simply
  // wrong, and used to send people round a loop raising it against an empty
  // table.
  if (candidates.totalActiveVenues < 2) {
    return NextResponse.json({
      status: "no_match",
      headline: "We are still building the Accra catalogue.",
      message:
        "There are not enough venues loaded yet to plan a real evening, and we will not invent one. Check back shortly.",
      suggestions: [],
    });
  }

  const areaLabel = inputs.surpriseMe ? "Accra" : inputs.areaNames.join(" & ");

  /*
   * A budget of nothing, checked before anything blames the budget.
   *
   * Zero means free, and free is a claim about a venue that somebody has to
   * have made: a place with no prices on file is withheld rather than shown as
   * free, because planning a free visit to somewhere that charges is how a
   * plan lies about what an evening costs. So only rows flagged is_free can
   * carry a stop here, and a plan needs two of them.
   *
   * Checked here rather than after planning, because an empty shortlist falls
   * into the message below, which says "the spots there run pricier" and
   * offers to raise a budget that is already at its floor. That is both wrong
   * and a loop with no exit: nothing they change about their answers will
   * conjure a free venue into the catalogue.
   */
  if (inputs.budget <= 0) {
    const free = candidates.venues.filter((v) => v.is_free === true).length;
    if (free < 2) {
      return NextResponse.json({
        status: "no_match",
        headline:
          free === 0
            ? `We have no free places recorded in ${areaLabel} yet.`
            : `We only have one free place recorded in ${areaLabel}.`,
        message:
          "A day out can genuinely cost nothing, but we will not put a venue in a free plan until somebody has confirmed it is free. That is a gap in our catalogue rather than in your answers, and even a small budget opens up the rest of it.",
        suggestions: [
          ...(inputs.surpriseMe
            ? []
            : ([{ label: "Look across all of Accra", action: "widen_area" }] as const)),
          { label: "Nudge budget to GHS 200", action: "raise_budget", value: 200 },
        ],
      });
    }
  }

  if (candidates.venues.length < 2) {
    const widerAreas = candidates.allAreaNames
      .filter((n) => !inputs.areaNames.includes(n))
      .slice(0, 2);
    const suggestions: Extract<GenerateResponse, { status: "no_match" }>["suggestions"] = [];
    if (widerAreas.length) {
      suggestions.push({ label: `Widen to ${widerAreas.join(" & ")}`, action: "widen_area" });
    }
    const nudge = Math.min(BUDGET_MAX, Math.ceil((inputs.budget * 1.5) / 50) * 50);
    if (nudge > inputs.budget) {
      suggestions.push({ label: `Nudge budget to GHS ${nudge}`, action: "raise_budget", value: nudge });
    }
    return NextResponse.json({
      status: "no_match",
      headline: `We couldn't fill the whole evening in ${areaLabel} at GHS ${inputs.budget}.`,
      message: "Honestly? The spots there run pricier. Two easy fixes:",
      suggestions,
    });
  }

  const plan = planItinerary(inputs, candidates);

  // No arrangement of real venues fits, so say so rather than trimming into
  // something nobody would want.
  if (!plan) {
    /*
     * A floor under the nudge, because half again of nothing is nothing.
     * A zero budget used to be offered only "widen the area", which cannot
     * help: the whole of Accra at GHS 0 is the same answer as one suburb
     * at GHS 0.
     */
    const nudge = Math.min(
      BUDGET_MAX,
      Math.max(200, Math.ceil((inputs.budget * 1.5) / 50) * 50)
    );
    const suggestions: Extract<GenerateResponse, { status: "no_match" }>["suggestions"] = [
      { label: "Widen the search area", action: "widen_area" },
    ];
    if (nudge > inputs.budget) {
      suggestions.push({ label: `Nudge budget to GHS ${nudge}`, action: "raise_budget", value: nudge });
    }

    /*
     * A narrowed focus usually fails for a different reason than money: we
     * hold too few priced venues of that kind. Blaming the budget there sends
     * someone to raise a number that was never the problem, so the shortage is
     * named and dropping the focus is offered as the fix that would work.
     */
    /*
     * Being shut is checked before money, because it is the one reason a
     * budget can never fix. Bliss closes every Monday and Game It Up shuts at
     * 21:00 seven days a week, so a late Monday plan can fail with a full
     * catalogue and plenty of money, and telling that person to spend more
     * sends them round a loop with no exit.
     */
    const hours = openOnDate(candidates.venues, inputs.date, inputs.startTime, inputs.hours);
    if (hours.closed > 0 && hours.open + hours.unknown < stopCountFor(inputs.hours, inputs.focus, inputs.vibes, inputs.stops)) {
      const weekday = new Date(`${inputs.date}T12:00:00`).toLocaleDateString("en-GB", {
        weekday: "long",
      });
      return NextResponse.json({
        status: "no_match",
        headline: `Most places in ${areaLabel} are closed ${weekday} at ${inputs.startTime}.`,
        message:
          "Nothing to do with your budget. Another day or an earlier start would both work.",
        suggestions: suggestions.filter((sug) => sug.action === "widen_area"),
      });
    }

    /*
     * A spa that would not fit is its own answer, and it comes first.
     *
     * The alternative was quietly planning the evening without it, which is
     * the app deciding the one thing somebody asked for did not matter. So say
     * what happened and offer the evening without it as a choice.
     */
    if (inputs.wellness && wellnessAllowed(inputs)) {
      return NextResponse.json({
        status: "no_match",
        headline: "We could not fit a spa into this one.",
        message:
          "Either no spa we hold is open then, or a treatment and the rest of the evening do not fit the budget together. We would rather say so than leave the spa out without telling you.",
        suggestions: [
          { label: "Plan it without the spa", action: "clear_wellness" },
          ...suggestions.filter((sug) => sug.action === "raise_budget"),
        ],
      });
    }

    /*
     * A meeting's one place was named, and the planner no longer substitutes
     * another kind for it, so when none fits the answer names what was asked
     * for. "We couldn't fill the whole evening" is the wrong sentence for a
     * coffee.
     */
    if (inputs.occasion === "business_meeting") {
      const kind = { cafe: "cafe", lounge: "lounge", restaurant: "restaurant" }[
        inputs.occasionDetail?.setting ?? "cafe"
      ] ?? "cafe";
      return NextResponse.json({
        status: "no_match",
        headline: `No ${kind} we hold fits GHS ${inputs.budget} for ${inputs.partySize}.`,
        message: `Either none is open then or the order for everyone runs over. We would rather say so than put the meeting somewhere that is not a ${kind}.`,
        suggestions: suggestions.filter((sug) => sug.action === "raise_budget" || sug.action === "widen_area"),
      });
    }

    const focusTypes = focusVenueTypes(inputs.focus);
    if (focusTypes.length) {
      const available = candidates.venues.filter((v) => focusTypes.includes(v.type)).length;
      /*
       * Measured against the stops this outing actually needs, not a flat
       * floor: two bowling alleys are plenty for a short afternoon and not
       * enough for a full day, and the earlier fixed threshold of two let the
       * second case fall through to a message about money.
       */
      if (available < stopCountFor(inputs.hours, inputs.focus, inputs.vibes, inputs.stops)) {
        return NextResponse.json({
          status: "no_match",
          headline: FOCUS_SHORTFALL[inputs.focus],
          message:
            "That is a gap in our catalog, not in your budget, we would rather say so than send you somewhere that does not fit.",
          suggestions: [
            { label: "Plan a bit of everything instead", action: "clear_focus" }, ...suggestions.filter((sug) => sug.action === "widen_area"),
          ],
        });
      }
    }

    return NextResponse.json({
      status: "no_match",
      headline: `We couldn't fill the whole evening in ${areaLabel} at GHS ${inputs.budget}.`,
      message: "Honestly? The spots there run pricier. Two easy fixes:",
      suggestions,
    });
  }

  // The plan is already valid at this point, so failing the request over prose
  // would throw away a working itinerary.
  const written = await writePlanCopy(inputs, plan);
  const copy = written.ok ? written.copy : fallbackCopy(inputs, plan);

  return NextResponse.json({ status: "ok", itinerary: assembleItinerary(inputs, plan, copy) });
}
