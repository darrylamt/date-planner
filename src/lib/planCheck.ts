import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCandidates } from "./matching";
import { planItinerary, type PlannedItinerary } from "./planner";
import { geminiJSON } from "./gemini";
import type { PlanInputs } from "./types";

/**
 * A second pair of eyes on each plan before it is shown (Gemini, free tier).
 *
 * The planner is rules, and rules miss what a person sees at a glance: two
 * dessert stops in a row, a sports bar on an anniversary, a nightcap forty
 * minutes across town after dinner. The check reads the plan and names what
 * is wrong; a serious problem at a stop sends the planner round once more
 * without that venue, and the better plan is the one shown. It never writes
 * the plan itself, and never holds one up: no answer in time, the plan stands.
 *
 * ── what it is sent ───────────────────────────────────────────────────────
 * The outing's shape and the venues only: occasion, party size, budget,
 * vibes, times, the stops and what is ordered. Never a name, a partner's
 * details, notes or anything typed: free-tier requests may be used by Google,
 * and the consent screen promises the personal parts go to Anthropic alone.
 *
 * Every verdict is kept in plan_checks (0088), so whether this helps can be
 * read rather than assumed.
 */
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemma-4-31b-it"];
/** Whether a serious problem sends the planner round again. */
const REPLAN = false;
/** The most a plan waits for its check. */
const DEADLINE_MS = 7000;

type Problem = {
  stop: number;
  kind: "wrong_for_occasion" | "too_loud" | "repetitive" | "too_far" | "odd_order" | "wrong_time" | "other";
  severity: "minor" | "serious";
  note: string;
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    verdict: { type: "STRING", enum: ["good", "problem"] },
    problems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          stop: { type: "INTEGER" },
          kind: { type: "STRING", enum: ["wrong_for_occasion", "too_loud", "repetitive", "too_far", "odd_order", "wrong_time", "other"] },
          severity: { type: "STRING", enum: ["minor", "serious"] },
          note: { type: "STRING" },
        },
        required: ["stop", "kind", "severity", "note"],
      },
    },
  },
  required: ["verdict", "problems"],
};

const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** The plan as the check sees it: shape and places, nobody's details. */
export function describePlan(inputs: PlanInputs, plan: PlannedItinerary): string {
  const lines = plan.stops.map((s, i) => {
    const ride = plan.hops[i] && i < plan.stops.length - 1 ? ` Then ${plan.hops[i].mins} min to the next stop.` : "";
    const what = s.orders.slice(0, 5).map((o) => `${o.qty}x ${o.item}`).join(", ");
    return `Stop ${i + 1}: ${s.label} at ${s.venue.name} (${s.venue.type}, ${s.venue.areas?.name ?? "Accra"})${
      s.event ? `, for the event "${s.event.title}"` : ""
    }, ${clock(s.arrivalMinutes)} for ${s.durationMins} min, GHS ${Math.round(s.cost)}${what ? `: ${what}` : ""}.${
      s.venue.insights?.noise ? ` Noise: ${s.venue.insights.noise}.` : ""
    }${ride}`;
  });
  return [
    `Occasion: ${inputs.occasion.replace(/_/g, " ")}. Party of ${inputs.partySize}. Budget GHS ${inputs.budget}, plan total GHS ${Math.round(plan.total)}.`,
    `Wanted: ${inputs.vibes?.length ? inputs.vibes.join(", ") : "no particular vibe"}${inputs.focus && inputs.focus !== "everything" ? `, mostly ${inputs.focus}` : ""}. Starts ${inputs.startTime} on ${inputs.date}.`,
    ...lines,
  ].join("\n");
}

export async function checkPlan(
  supabase: SupabaseClient,
  inputs: PlanInputs,
  plan: PlannedItinerary,
  log?: SupabaseClient | null
): Promise<PlannedItinerary> {
  const started = Date.now();
  const prompt = `${describePlan(inputs, plan)}

You are checking an outing plan made by software for people in Accra, Ghana, before they see it. Would a thoughtful local friend say something is wrong? Look for: a stop that does not suit the occasion (a sports bar on an anniversary, a club for a business meeting), a place too loud to talk at for a date or meeting, the same kind of stop twice in a row (two dessert places, two dinners), a long ride for a short stop or a ride across town late at night, an odd order (dessert before dinner, coffee at midnight), and a time that does not suit the place.
Only real problems. Prices, budgets and the venues' quality are not yours to judge. "serious" means you would change that stop; "minor" means worth a mention. stop is the stop's number (1 is the first). If nothing is wrong, verdict "good" and no problems.`;

  const timer = new Promise<null>((r) => setTimeout(() => r(null), DEADLINE_MS));
  const r = await Promise.race([geminiJSON<{ verdict: string; problems: Problem[] }>({ prompt, schema: SCHEMA, parts: [], models: MODELS, timeoutMs: 6000 }), timer]);

  const record = (verdict: "good" | "flagged" | "skipped", problems: Problem[], action: "kept" | "replanned" | "replan_failed", model: string | null) =>
    log
      ?.from("plan_checks")
      .insert({ occasion: inputs.occasion, verdict, problems, action, model, ms: Date.now() - started })
      .then(
        () => undefined,
        () => undefined
      );

  if (!r || !r.ok) {
    await record("skipped", [], "kept", null);
    return plan;
  }
  const problems = (r.data.problems ?? []).filter((p) => p && Number.isInteger(p.stop) && p.stop >= 1 && p.stop <= plan.stops.length);
  /*
   * A stop worth changing: serious, and not something the person asked for.
   * Events are mostly the planner's own choice (a Gaderin night that fitted
   * the vibe), and one that is wrong for the occasion is the commonest thing
   * the check catches: a Saturday hype party in a first date. A film is
   * different: "Catch a movie" was asked for, so it stays and the check's
   * point about it is only recorded.
   */
  const target = problems.find((p) => p.severity === "serious" && !plan.stops[p.stop - 1].event?.id.startsWith("movie:"));
  // Rebuilding is switched off while a hang in it is found: the check only records.
  if (r.data.verdict === "good" || !target || !REPLAN) {
    await record(problems.length ? "flagged" : "good", problems, "kept", r.model);
    return plan;
  }

  const venueId = plan.stops[target.stop - 1].venue.id;
  try {
    const candidates = await fetchCandidates(supabase, inputs, { excludeVenueIds: [venueId] });
    const again = candidates.venues.length >= 2 ? planItinerary(inputs, candidates) : null;
    if (again && again.stops.length >= plan.stops.length) {
      await record("flagged", problems, "replanned", r.model);
      return again;
    }
  } catch {
    // The first plan stands.
  }
  await record("flagged", problems, "replan_failed", r.model);
  return plan;
}
