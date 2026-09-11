import { NextResponse } from "next/server";
import { planInputsSchema } from "@/lib/schemas";
import { fetchCandidates } from "@/lib/matching";
import {
  planItinerary,
  clockFromMinutes,
  focusVenueTypes,
  stopCountFor,
  type PlannedItinerary,
} from "@/lib/planner";
import { fallbackCopy, writePlanCopy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/server";
import { BUDGET_MAX } from "@/lib/budget";
import type {
  GenerateResponse,
  Itinerary,
  ItineraryStop,
  PlanInputs,
  StopAlternate,
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

/** Turn the planned itinerary plus its copy into the client's shape. */
function assemble(
  inputs: PlanInputs,
  plan: PlannedItinerary,
  copy: { title: string; personal_summary: string; budget_note: string | null; stops: { label: string; what_to_do: string; why_this_fits: string }[] }
): Itinerary {
  const stops: ItineraryStop[] = plan.stops.map((s, i) => {
    const words = copy.stops[i];
    // The planner already priced each runner-up and only kept ones that fit
    // the budget. Those figures are carried through as-is: re-deriving them
    // from avg_cost here would discard the menu-based price and show an
    // unpriced venue as free.
    const alternates: StopAlternate[] = s.alternates.map((a) => ({
      venue_id: a.venue.id,
      name: a.venue.name,
      area: a.venue.areas?.name ?? "",
      image_url: a.venue.image_url,
      google_maps_url: a.venue.google_maps_url,
      reservation_required: a.venue.reservation_required,
      orders: a.orders,
      est_cost_ghs: a.cost,
      why_this_fits: "",
    }));

    return {
      venue_id: s.venue.id,
      kind: "venue",
      name: s.venue.name,
      area: s.venue.areas?.name ?? "",
      arrival_time: clockFromMinutes(s.arrivalMinutes),
      duration_mins: s.durationMins,
      label: words?.label || s.label,
      what_to_do: words?.what_to_do ?? "",
      orders: s.orders,
      est_cost_ghs: s.cost,
      why_this_fits: words?.why_this_fits ?? "",
      image_url: s.venue.image_url,
      google_maps_url: s.venue.google_maps_url,
      reservation_required: s.venue.reservation_required,
      alternates,
    };
  });

  return {
    title: copy.title,
    date: inputs.date,
    summary_route: Array.from(new Set(stops.map((s) => s.area).filter(Boolean))).join(" → "),
    stops,
    hops: plan.hops,
    food_total_ghs: Math.round(plan.foodTotal),
    transport_total_ghs: Math.round(plan.transportTotal),
    est_total_ghs: Math.round(plan.total),
    price_confidence: plan.confidence,
    budget_note: copy.budget_note,
    personal_summary: copy.personal_summary,
  };
}

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
    const nudge = Math.min(BUDGET_MAX, Math.ceil((inputs.budget * 1.5) / 50) * 50);
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
    const focusTypes = focusVenueTypes(inputs.focus);
    if (focusTypes.length) {
      const available = candidates.venues.filter((v) => focusTypes.includes(v.type)).length;
      /*
       * Measured against the stops this outing actually needs, not a flat
       * floor: two bowling alleys are plenty for a short afternoon and not
       * enough for a full day, and the earlier fixed threshold of two let the
       * second case fall through to a message about money.
       */
      if (available < stopCountFor(inputs.hours)) {
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

  return NextResponse.json({ status: "ok", itinerary: assemble(inputs, plan, copy) });
}
