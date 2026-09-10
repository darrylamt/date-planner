import { NextResponse } from "next/server";
import { z } from "zod";
import { anthropic, MODEL, parseModelJson, textFromResponse } from "@/lib/anthropic";
import { itinerarySchema, itineraryStopSchema, planInputsSchema } from "@/lib/schemas";
import { fetchCandidates } from "@/lib/matching";
import { buildSwapUserMessage, buildSystemPrompt } from "@/lib/prompt";
import { coordsForStops, hopTableFor, recomputeItinerary, stopsAreGrounded } from "@/lib/itinerary";
import { createClient } from "@/lib/supabase/server";
import type { Itinerary, ItineraryStop, PlanInputs } from "@/lib/types";

export const maxDuration = 60;

const swapBodySchema = z.object({
  inputs: planInputsSchema,
  itinerary: itinerarySchema,
  stopIndex: z.number().int().min(0),
});

export async function POST(req: Request) {
  let body: z.infer<typeof swapBodySchema>;
  try {
    body = swapBodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid swap request." }, { status: 400 });
  }

  const inputs = body.inputs as PlanInputs;
  const itinerary = body.itinerary as Itinerary;
  const stopIndex = body.stopIndex;

  if (stopIndex >= itinerary.stops.length) {
    return NextResponse.json({ status: "error", message: "Invalid stop." }, { status: 400 });
  }

  const supabase = createClient();
  const usedIds = itinerary.stops.map((s) => s.venue_id);

  let candidates;
  try {
    candidates = await fetchCandidates(supabase, inputs, { excludeVenueIds: usedIds });
  } catch (e) {
    console.error("swap candidate fetch failed", e);
    return NextResponse.json(
      { status: "error", message: "We couldn't reach the venue catalog." },
      { status: 500 }
    );
  }

  if (candidates.venues.length === 0) {
    return NextResponse.json({
      status: "no_match",
      message: "No other spot fits this slot right now — try widening the area or budget.",
    });
  }

  // Budget available for the replacement: whole budget minus the other stops,
  // minus a conservative transport allowance (recomputed properly afterwards).
  const otherStopsCost = itinerary.stops.reduce(
    (sum, s, i) => (i === stopIndex ? sum : sum + Number(s.est_cost_ghs)),
    0
  );
  const transportAllowance = Math.max(itinerary.transport_total_ghs, (itinerary.stops.length - 1) * 40);
  const budgetForStop = Math.max(0, inputs.budget - otherStopsCost - transportAllowance);

  const hopTable = hopTableFor(candidates.venues);
  const venueIds = new Set(candidates.venues.map((v) => v.id));
  const eventIds = new Set(candidates.events.map((e) => e.id));

  const messages: { role: "user" | "assistant"; content: string }[] = [
    {
      role: "user",
      content: buildSwapUserMessage(inputs, itinerary, stopIndex, candidates, hopTable, budgetForStop),
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: buildSystemPrompt(),
        messages,
      });
      raw = textFromResponse(msg);
    } catch (e) {
      console.error("anthropic swap call failed", e);
      return NextResponse.json(
        { status: "error", message: "The planner service is unavailable right now." },
        { status: 502 }
      );
    }

    try {
      const newStop = itineraryStopSchema.parse(parseModelJson<ItineraryStop>(raw)) as ItineraryStop;

      if (!stopsAreGrounded([newStop], venueIds, eventIds)) {
        throw new Error("replacement venue not in candidate list");
      }

      const stops = itinerary.stops.map((s, i) => (i === stopIndex ? newStop : s));
      const coords = await coordsForStops(supabase, stops);
      const updated = recomputeItinerary(
        { ...itinerary, stops, summary_route: stops.map((s) => s.area).join(" → ") },
        coords
      );

      if (updated.est_total_ghs > inputs.budget) {
        throw new Error(`swap busts the budget (GHS ${updated.est_total_ghs} > ${inputs.budget})`);
      }

      return NextResponse.json({ status: "ok", itinerary: updated });
    } catch (e) {
      if (attempt === 0) {
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content: `That replacement was rejected (${(e as Error).message}). Pick a different candidate venue and keep the stop cost at or under GHS ${budgetForStop}. Return the single stop JSON only.`,
        });
        continue;
      }
      console.error("swap failed after retry", e);
      return NextResponse.json(
        { status: "error", message: "Couldn't find a good swap — the rest of your plan is untouched." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { status: "error", message: "Couldn't find a good swap." },
    { status: 500 }
  );
}
