import { NextResponse } from "next/server";
import { planInputsSchema } from "@/lib/schemas";
import { fetchCandidates } from "@/lib/matching";
import {
  focusesOf,
  openOnDate,
  planItinerary,
  focusVenueTypes,
  stopCountFor,
} from "@/lib/planner";
import { fallbackCopy, writePlanCopy } from "@/lib/copy";
import { assembleItinerary } from "@/lib/itinerary";
import { recordDemand, type DemandMeta } from "@/lib/demand";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checkPlan } from "@/lib/planCheck";
import { tasteFor, type Taste } from "@/lib/taste";
import { getCaller } from "@/lib/supabase/server";
import { BUDGET_MAX, freeToVisit } from "@/lib/budget";
import { DEFAULT_RADIUS_KM, DEFAULT_WELLNESS_KIND, REACH_FALLBACK_KM, WELLNESS_KINDS, wellnessAllowed } from "@/lib/planConstants";
import type {
  GenerateResponse,
  Itinerary,
  PlanInputs,
} from "@/lib/types";

const listOf = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * One more try, reaching further, before telling somebody nothing fitted.
 *
 * A thin area failed every plan outright: a first date in Aburi came back as
 * "we couldn't fill the whole evening", with a button to widen that cost a
 * tap and a second wait to reach an answer the app could have reached itself.
 * So the planner widens on its own, once, and the plan says so in the note
 * the app already shows under the total, which every build displays.
 *
 * Only for areas somebody picked. "Only these" (a reach of 0) is a choice and
 * is kept; "near me" and "anywhere" already reach as far as they mean to.
 * Null when the wider search cannot fill it either, and the caller then
 * explains the original failure as before.
 */
async function reachFurther(
  supabase: ReturnType<typeof createClient>,
  inputs: PlanInputs,
  requestStart: number = Date.now(),
  taste: Taste | null = null
): Promise<NextResponse<GenerateResponse> | null> {
  if (inputs.surpriseMe || inputs.near || !inputs.areaIds.length) return null;
  const chosen = inputs.radiusKm ?? DEFAULT_RADIUS_KM;
  if (chosen === 0 || chosen >= REACH_FALLBACK_KM) return null;

  const wider: PlanInputs = { ...inputs, radiusKm: REACH_FALLBACK_KM };
  let candidates;
  try {
    candidates = await fetchCandidates(supabase, wider, { taste });
  } catch {
    return null;
  }
  if (candidates.venues.length < 2) return null;
  const first = planItinerary(wider, candidates);
  if (!first) return null;
  // A second look before it is shown (planCheck.ts): names never leave.
  const plan = await checkPlan(candidates, wider, first, createServiceClient(), requestStart);

  const outside = [
    ...new Set(
      plan.stops
        .map((s) => s.venue.areas?.name ?? "")
        .filter((name) => name && !inputs.areaNames.includes(name))
    ),
  ];

  const written = inputs.ai === false ? null : await writePlanCopy(wider, plan);
  const copy = written?.ok ? written.copy : fallbackCopy(wider, plan);
  const itinerary = assembleItinerary(wider, plan, copy);
  if (outside.length) {
    // "Also" only when the plan still has a stop where they asked: a thin area
    // can end up with none of its own, and saying so is the honest version.
    const anyInside = plan.stops.some((s) => inputs.areaNames.includes(s.venue.areas?.name ?? ""));
    const here = listOf(inputs.areaNames);
    const note = anyInside
      ? `There was not enough in ${here} alone, so this plan also uses ${listOf(outside)}.`
      : `There was not enough in ${here} for this one, so it is in ${listOf(outside)}, the nearest that could fill it.`;
    itinerary.notice = note;
  }
  const missed = movieNotice(wider, plan);
  if (missed) itinerary.notice = itinerary.notice ? `${missed} ${itinerary.notice}` : missed;
  return NextResponse.json({
    status: "ok",
    itinerary,
    reached: { km: REACH_FALLBACK_KM, areas: outside },
  });
}

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

/**
 * The route, with an anonymous note of what was asked and how it went
 * (migration 0065), taken from the answer itself so every exit is covered.
 * Awaited, because a serverless function may stop the moment it has replied,
 * and an insert is a few milliseconds.
 */
export async function POST(req: Request): Promise<NextResponse<GenerateResponse>> {
  const copy = req.clone();
  const res = await generate(req);
  try {
    const parsed = planInputsSchema.safeParse(await copy.json());
    if (parsed.success) await recordDemand(parsed.data as PlanInputs, (await res.clone().json()) as GenerateResponse, await demandMeta(req));
  } catch {
    /* never a failed plan over statistics */
  }
  return res;
}

/**
 * Who asked and on what, for the plan log (0097): the account or the phone,
 * whether it is a team login, and the platform and build the app says.
 * The website sends no headers, so it is the web.
 */
async function demandMeta(req: Request): Promise<DemandMeta> {
  const device = req.headers.get("x-duro-device");
  const said = req.headers.get("x-duro-platform");
  const platform = said === "ios" || said === "android" ? said : device ? null : "web";
  const appVersion = req.headers.get("x-duro-version")?.slice(0, 32) || null;
  const caller = await getCaller(req).catch(() => null);
  let team = false;
  if (caller && !caller.anonymous) {
    const db = createServiceClient();
    const [{ data: me }, { count }] = await Promise.all([
      db.from("profiles").select("is_admin").eq("id", caller.id).maybeSingle(),
      db.from("staff_roles").select("user_id", { count: "exact", head: true }).eq("user_id", caller.id),
    ]);
    team = Boolean((me as { is_admin?: boolean } | null)?.is_admin) || (count ?? 0) > 0;
  }
  const who = caller && !caller.anonymous ? `u:${caller.id}` : device && /^[A-Za-z0-9_-]{6,64}$/.test(device) ? `d:${device}` : null;
  return { who, team, platform, appVersion };
}

async function generate(req: Request): Promise<NextResponse<GenerateResponse>> {
  // For the plan check's time budget (planCheck.ts).
  const requestStart = Date.now();
  let inputs: PlanInputs;
  try {
    inputs = planInputsSchema.parse(await req.json()) as PlanInputs;
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid plan inputs." }, { status: 400 });
  }

  const supabase = createClient();

  /*
   * Who is asking, so the plan can lean towards what they keep (taste.ts):
   * the account when the app sends its token, otherwise the phone's random
   * id. Either missing is fine; a failure here costs the plan its tilt and
   * nothing else.
   */
  const caller = req.headers.get("authorization") ? await getCaller(req).catch(() => null) : null;
  const taste = await tasteFor(createServiceClient(), {
    userId: caller && !caller.anonymous ? caller.id : null,
    deviceId: req.headers.get("x-duro-device"),
  }).catch(() => null);

  let candidates;
  try {
    candidates = await fetchCandidates(supabase, inputs, { taste });
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
  // The plan's own city, in every message below: a Kumasi plan is not told about Accra.
  const city = inputs.city || "Accra";

  if (candidates.totalActiveVenues < 2) {
    return NextResponse.json({
      status: "no_match",
      headline: `We are still building the ${city} catalogue.`,
      message:
        "There are not enough venues loaded yet to plan a real evening, and we will not invent one. Check back shortly.",
      suggestions: [],
    });
  }

  const areaLabel = inputs.surpriseMe ? city : inputs.areaNames.join(" & ");

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
    const free = candidates.venues.filter((v) => freeToVisit(v)).length;
    if (free < 2) {
      const reached = await reachFurther(supabase, inputs, requestStart, taste);
      if (reached) return reached;
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
            : ([{ label: `Look across all of ${city}`, action: "widen_area" }] as const)),
          { label: "Nudge budget to GHS 200", action: "raise_budget", value: 200 },
        ],
      });
    }
  }

  if (candidates.venues.length < 2) {
    const reached = await reachFurther(supabase, inputs, requestStart, taste);
    if (reached) return reached;
    /*
     * The whole city already searched and still nothing: a city we are only
     * starting on. Said as that, with no "widen" to tap, because widening a
     * search that already covers the city would only come back here.
     */
    if (inputs.surpriseMe) {
      return NextResponse.json({
        status: "no_match",
        headline: `We're still adding places in ${city}.`,
        message: `There aren't enough priced places in ${city} yet to build an evening, and we won't invent one. We're adding more every week.`,
        suggestions: [],
      });
    }
    const suggestions: Extract<GenerateResponse, { status: "no_match" }>["suggestions"] = [];
    // Tapping it searches all of this city (the app sets surpriseMe), so it says so.
    suggestions.push({ label: `Look across all of ${city}`, action: "widen_area" });
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

  let plan = planItinerary(inputs, candidates);

  // No arrangement of real venues fits, so say so rather than trimming into
  // something nobody would want. First, the next neighbourhood over.
  if (!plan) {
    const reached = await reachFurther(supabase, inputs, requestStart, taste);
    if (reached) return reached;
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
    // Only when there is wider to go: the whole city searched already has no further to widen.
    const suggestions: Extract<GenerateResponse, { status: "no_match" }>["suggestions"] = inputs.surpriseMe
      ? []
      : [{ label: `Look across all of ${city}`, action: "widen_area" }];
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
    if (hours.closed > 0 && hours.open + hours.unknown < stopCountFor(inputs.hours, focusesOf(inputs), inputs.vibes, inputs.stops)) {
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
        headline:
          (inputs.wellnessKind ?? DEFAULT_WELLNESS_KIND) === "any"
            ? "We could not fit a spa into this one."
            : `We could not fit a ${(
                WELLNESS_KINDS.find((k) => k.id === (inputs.wellnessKind ?? DEFAULT_WELLNESS_KIND))?.label ?? "spa"
              ).toLowerCase()} into this one.`,
        message:
          "Either no spa we hold offers it then, or the treatment and the rest of the evening do not fit the budget together. We would rather say so than book a different treatment without telling you.",
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

    const narrowed = focusesOf(inputs);
    const focusTypes = focusVenueTypes(narrowed);
    if (focusTypes.length) {
      const available = candidates.venues.filter((v) => focusTypes.includes(v.type)).length;
      /*
       * Measured against the stops this outing actually needs, not a flat
       * floor: two bowling alleys are plenty for a short afternoon and not
       * enough for a full day, and the earlier fixed threshold of two let the
       * second case fall through to a message about money.
       */
      if (available < stopCountFor(inputs.hours, focusesOf(inputs), inputs.vibes, inputs.stops)) {
        return NextResponse.json({
          status: "no_match",
          headline:
            narrowed.length === 1
              ? FOCUS_SHORTFALL[narrowed[0]]
              : "We do not have enough priced places of those kinds in the catalogue yet.",
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
  /*
   * Not a word of it to Anthropic without permission. The person declined
   * sending their answers to a third-party AI (guideline 5.1.2(i)), so the
   * description is written from the plan itself, here, with no model call.
   */
  // A second look before it is shown (planCheck.ts): names never leave.
  plan = await checkPlan(candidates, inputs, plan, createServiceClient(), requestStart);

  const written = inputs.ai === false ? null : await writePlanCopy(inputs, plan);
  const copy = written?.ok ? written.copy : fallbackCopy(inputs, plan);

  const itinerary = assembleItinerary(inputs, plan, copy);
  const missed = movieNotice(inputs, plan);
  if (missed) itinerary.notice = missed;
  return NextResponse.json({ status: "ok", itinerary });
}

/**
 * A film was asked for and none is in the plan: say so, and why it usually
 * is. Without it the plan quietly reads as if the question had been ignored.
 */
function movieNotice(inputs: PlanInputs, plan: { stops: { event?: { id: string } | null }[] }): string | null {
  if (!inputs.movie || plan.stops.some((s) => s.event?.id.startsWith("movie:"))) return null;
  const which = inputs.movieGenres?.length ? `${inputs.movieGenres.join(" or ").toLowerCase()} ` : "";
  return `No ${which}showing at Silverbird fits this evening and budget, so there is no film in this plan. Try another time, genre or day.`;
}
