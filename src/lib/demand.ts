import { createServiceClient } from "./supabase/server";
import { focusesOf } from "./planConstants";
import { weekdayOf } from "./hours";
import type { GenerateResponse, PlanInputs } from "./types";

/** Budgets in bands, never the figure: enough to see who is asking, not who. */
export function budgetBand(ghs: number): string {
  if (ghs <= 0) return "free";
  if (ghs < 300) return "under 300";
  if (ghs < 600) return "300-600";
  if (ghs < 1000) return "600-1000";
  if (ghs < 2000) return "1000-2000";
  return "2000+";
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

/**
 * One anonymous row about a plan request. See migration 0065.
 *
 * No user, no account, and never the exact point: "near me" is rounded to a
 * square about 1.1 km on a side before it is written. Failures are swallowed,
 * because a plan must never fail over its own statistics.
 */
export async function recordDemand(inputs: PlanInputs, answer: GenerateResponse): Promise<void> {
  if (answer.status === "error") return;
  try {
    const db = createServiceClient();
    const venueIds =
      answer.status === "ok"
        ? [...new Set(answer.itinerary.stops.map((s) => s.venue_id).filter((id): id is string => Boolean(id)))]
        : [];
    await db.from("plan_demand").insert({
      plan_date: inputs.date,
      weekday: weekdayOf(inputs.date),
      start_minute: minutesOf(inputs.startTime),
      source: inputs.near ? "near" : inputs.surpriseMe || !inputs.areaIds.length ? "anywhere" : "areas",
      city: inputs.city ?? "Accra",
      area_ids: inputs.near || inputs.surpriseMe ? [] : inputs.areaIds,
      cell_lat: inputs.near ? Math.round(inputs.near.lat * 100) / 100 : null,
      cell_lng: inputs.near ? Math.round(inputs.near.lng * 100) / 100 : null,
      radius_km: inputs.radiusKm ?? null,
      occasion: inputs.occasion,
      party_size: inputs.partySize,
      budget_band: budgetBand(inputs.budget),
      focuses: focusesOf(inputs),
      vibes: inputs.vibes ?? [],
      cuisines: inputs.cuisines ?? [],
      outcome: answer.status === "ok" ? "ok" : "no_match",
      no_match_reason: answer.status === "no_match" ? answer.headline.slice(0, 200) : null,
      venue_ids: venueIds,
    });
  } catch {
    /* statistics are never worth a failed plan */
  }
}
