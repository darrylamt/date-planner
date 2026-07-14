import { NextResponse } from "next/server";
import { anthropic, MODEL, parseModelJson, textFromResponse } from "@/lib/anthropic";
import { itinerarySchema, planInputsSchema } from "@/lib/schemas";
import { fetchCandidates, cheapestTwoStopEstimate } from "@/lib/matching";
import { buildGenerateUserMessage, buildSystemPrompt } from "@/lib/prompt";
import { coordsForStops, hopTableFor, recomputeItinerary, stopsAreGrounded } from "@/lib/itinerary";
import { createClient } from "@/lib/supabase/server";
import type { GenerateResponse, Itinerary, PlanInputs } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request): Promise<NextResponse<GenerateResponse>> {
  let inputs: PlanInputs;
  try {
    inputs = planInputsSchema.parse(await req.json()) as PlanInputs;
  } catch {
    return NextResponse.json(
      { status: "error", message: "Invalid plan inputs." },
      { status: 400 }
    );
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

  // Too few real venues → honest guidance, never a fabricated plan.
  if (candidates.venues.length < 2) {
    const areaLabel = inputs.surpriseMe ? "Accra" : inputs.areaNames.join(" & ");
    const widerAreas = candidates.allAreaNames
      .filter((n) => !inputs.areaNames.includes(n))
      .slice(0, 2);
    const suggestions: Extract<GenerateResponse, { status: "no_match" }>["suggestions"] = [];
    if (widerAreas.length) {
      suggestions.push({ label: `Widen to ${widerAreas.join(" & ")}`, action: "widen_area" });
    }
    const nudge = Math.min(3000, Math.max(inputs.budget + 150, Math.ceil((inputs.budget * 1.5) / 50) * 50));
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

  // Budget sanity: cheaper to catch it here than to ask the model to fail.
  const floor = cheapestTwoStopEstimate(candidates.venues);
  if (floor > inputs.budget) {
    const areaLabel = inputs.surpriseMe ? "Accra" : inputs.areaNames.join(" & ");
    const nudge = Math.min(3000, Math.ceil((floor * 1.15) / 50) * 50);
    const suggestions: Extract<GenerateResponse, { status: "no_match" }>["suggestions"] = [
      { label: "Widen the search area", action: "widen_area" },
    ];
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

  const hopTable = hopTableFor(candidates.venues);
  const venueIds = new Set(candidates.venues.map((v) => v.id));
  const eventIds = new Set(candidates.events.map((e) => e.id));
  const system = buildSystemPrompt();

  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: buildGenerateUserMessage(inputs, candidates, hopTable) },
  ];

  // One corrective retry if the first plan is ungrounded or over budget.
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system,
        messages,
      });
      raw = textFromResponse(msg);
    } catch (e) {
      console.error("anthropic call failed", e);
      return NextResponse.json(
        { status: "error", message: "The planner service is unavailable right now." },
        { status: 502 }
      );
    }

    try {
      const parsed = itinerarySchema.parse(parseModelJson<Itinerary>(raw)) as Itinerary;

      if (!stopsAreGrounded(parsed.stops, venueIds, eventIds)) {
        throw new Error("ungrounded venue in plan");
      }

      const coords = await coordsForStops(supabase, parsed.stops);
      const finalPlan = recomputeItinerary(parsed, coords);

      if (finalPlan.est_total_ghs > inputs.budget) {
        throw new Error(
          `over budget: est GHS ${finalPlan.est_total_ghs} vs budget GHS ${inputs.budget}`
        );
      }

      return NextResponse.json({ status: "ok", itinerary: finalPlan });
    } catch (e) {
      if (attempt === 0) {
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content: `That plan was rejected (${(e as Error).message}). Fix it: use ONLY provided venue_ids and menu prices, and keep est_total_ghs (food + recomputed transport) safely under GHS ${inputs.budget}. Return the corrected Itinerary JSON only.`,
        });
        continue;
      }
      console.error("generation failed after retry", e);
      return NextResponse.json(
        {
          status: "error",
          message: "Something went wrong while building the plan. Your answers are safe — nothing was lost.",
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { status: "error", message: "Something went wrong while building the plan." },
    { status: 500 }
  );
}
