import { z } from "zod";
import { fetchCandidates } from "../../matching";
import { planItinerary, openOnDate, focusVenueTypes, stopCountFor } from "../../planner";
import { assembleItinerary } from "../../itinerary";
import { VIBE_CHIP_TAGS } from "../../catalog";
import type { Itinerary, PlanInputs } from "../../types";
import type { ChatTool, ToolContext } from "./types";

/**
 * Build a real evening.
 *
 * The same engine the questionnaire uses, reached a different way. Everything
 * that decides anything, which venues are candidates, what gets ordered, what
 * it costs, whether it fits, happens in planItinerary exactly as it does for
 * the form. The model's part is to turn what somebody said into inputs and to
 * describe the result afterwards.
 *
 * That division is the point. A chatbot that assembled its own itinerary would
 * be a second planner with its own arithmetic and its own opinions about
 * budgets, and the two would disagree. There is one planner and this is a door
 * into it.
 *
 * Notably absent: writePlanCopy. The questionnaire asks a model for the title
 * and the per-stop prose because nothing else is going to write them. Here the
 * assistant is already writing, so paying for a second call to produce words
 * it is about to restate would be spending twice for one paragraph.
 */
/*
 * What an unanswered question is worth.
 *
 * Every one of these was required, so a vague opener -- "plan me something in
 * Osu on Saturday" -- could not reach the planner at all and the only move
 * left was a form: how many, how long, from when, how much. That is a message
 * each way before anything exists, and the person may not come back.
 *
 * The figures are the medians of the fifteen plans actually built through the
 * questionnaire, not a guess at what is reasonable: GHS 800, two people, four
 * hours, starting at seven. A plan on those is wrong in a way one sentence
 * fixes, and the itinerary shows its own total, so being wrong is visible
 * immediately rather than discovered at the till.
 */
const DEFAULTS = {
  start_time: "19:00",
  hours: 4,
  party_size: 2,
  budget_ghs: 800,
} as const;

const argsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  hours: z.number().min(1).max(12).optional(),
  party_size: z.number().int().min(1).max(20).optional(),
  budget_ghs: z.number().positive().max(100000).optional(),
  areas: z.array(z.string()).max(6).optional(),
  vibes: z.array(z.string()).max(4).optional(),
  stops: z.number().int().min(2).max(5).optional(),
  focus: z.enum(["everything", "food", "drinks", "activities"]).optional(),
  cuisine: z.enum(["either", "local", "continental"]).optional(),
  alcohol: z.enum(["either", "none"]).optional(),
  occasion: z
    .enum([
      "first_date",
      "anniversary",
      "date_night",
      "friend_outing",
      "birthday",
      "graduation",
      "celebration",
      "solo_day",
    ])
    .optional(),
  /** For the copy on the card, never for filtering. */
  about_them: z.string().max(300).optional(),
});

export type BuildPlanArgs = z.infer<typeof argsSchema>;

/**
 * Carried out of the tool alongside the digest the model reads.
 *
 * The route pulls this off the result and streams it to the app as its own
 * event, so the card can be opened without the model having to repeat an
 * itinerary back as prose, which it would get wrong and which would cost a
 * fortune in output tokens.
 */
export interface BuiltPlan {
  itinerary: Itinerary;
  inputs: PlanInputs;
}

const built = new WeakMap<object, BuiltPlan>();

/** The plan attached to a tool result, if that result was a successful build. */
export function planFrom(result: unknown): BuiltPlan | null {
  return typeof result === "object" && result !== null ? (built.get(result) ?? null) : null;
}

export const buildPlan: ChatTool<BuildPlanArgs> = {
  name: "build_plan",
  description:
    "Build a real, costed itinerary from the catalogue: venues, what to order, " +
    "prices and travel between them. Use when somebody wants an evening planned " +
    "rather than a question answered. Only the date is needed. Start time, " +
    "length, party size and budget all fall back to what most people choose " +
    "(19:00, four hours, two people, GHS 800), so build the plan and say which " +
    "of those you assumed rather than asking first. Pass anything they actually " +
    "told you. The app shows the plan itself, so describe it in a sentence or " +
    "two and do not list every stop back.",
  parameters: {
    type: "object",
    properties: {
      date: { type: "string", description: "ISO date, yyyy-mm-dd." },
      start_time: { type: "string", description: "24h time HH:MM. Defaults to 19:00." },
      hours: { type: "number", description: "How long the outing should run. Defaults to 4." },
      party_size: {
        type: "integer",
        description: "How many people, including them. Defaults to 2.",
      },
      budget_ghs: {
        type: "number",
        description:
          "Total for the whole party, in cedis. The plan spends up to it. Defaults to 800.",
      },
      areas: {
        type: "array",
        items: { type: "string" },
        description: "Neighbourhoods. Omit to search all of Accra.",
      },
      vibes: {
        type: "array",
        items: { type: "string" },
        description: `Up to four of: ${Object.keys(VIBE_CHIP_TAGS).join(", ")}.`,
      },
      stops: { type: "integer", description: "How many places. Omit to let the length decide." },
      focus: {
        enum: ["everything", "food", "drinks", "activities"],
        description: "What the outing is made of. Defaults to everything.",
      },
      cuisine: { enum: ["either", "local", "continental"], description: "Only if they said." },
      alcohol: {
        enum: ["either", "none"],
        description:
          "Pass 'none' only if they said they do not drink. Orders then come only from drinks confirmed alcohol-free.",
      },
      occasion: {
        enum: [
          "first_date",
          "anniversary",
          "date_night",
          "friend_outing",
          "birthday",
          "graduation",
          "celebration",
          "solo_day",
        ],
        description: "What the outing is for. Shapes which venues suit it.",
      },
      about_them: {
        type: "string",
        description:
          "Anything they said about who it is for, in their own words. Used for the card's wording, never to filter.",
      },
    },
    // The date alone. Everything else has a default worth more than a question.
    required: ["date"],
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args, ctx) {
    /*
     * Names in, ids out, before anything else.
     *
     * fetchCandidates filters on area_id and ignores areaNames entirely, so
     * handing it names with an empty id list silently searches the whole of
     * Accra. Asking for Osu returned an evening in East Legon and Weija, and
     * nothing anywhere reported a problem: the filter simply never ran.
     */
    const areas = await resolveAreas(ctx, args.areas ?? []);
    if (args.areas?.length && !areas.ids.length) {
      return {
        built: false as const,
        reason: `We do not cover ${args.areas.join(" or ")}. Say which areas we do have and let them choose; do not plan somewhere else and call it theirs.`,
      };
    }

    const inputs = toPlanInputs(args, areas);
    const candidates = await fetchCandidates(ctx.catalog, inputs);

    if (candidates.totalActiveVenues < 2) {
      return {
        built: false as const,
        reason:
          "There are not enough venues in the catalogue yet to build a real evening. Say so; do not invent one.",
      };
    }

    const plan = planItinerary(inputs, candidates);

    /*
     * When it cannot be built, say which part failed rather than that nothing
     * was found. The same diagnosis the questionnaire makes: being shut is
     * checked before money, because it is the one reason a bigger budget can
     * never fix, and a focus that the catalogue is thin on is our shortage
     * rather than their budget.
     */
    if (!plan) {
      return { built: false as const, reason: whyNot(inputs, candidates) };
    }

    const itinerary = assembleItinerary(inputs, plan, {
      /*
       * Placeholder words, deliberately. The per-stop labels the planner
       * already chose are real; the title and the personal line are the
       * assistant's job, and it is about to write them in the message that
       * accompanies this. Asking a second model call for prose nobody reads
       * would be paying twice for one paragraph.
       */
      title: `${inputs.partySize > 2 ? "An outing" : "An evening"} in ${plan.stops[0]?.venue.areas?.name ?? "Accra"}`,
      personal_summary: args.about_them ?? "",
      budget_note: null,
      stops: plan.stops.map((s) => ({ label: s.label, what_to_do: "", why_this_fits: "" })),
    });

    /*
     * Two audiences from one call. The model gets a digest small enough that
     * it does not pay to carry the whole itinerary in its context for the rest
     * of the conversation; the app gets the itinerary itself, off to one side,
     * so the card is real rather than retyped from prose.
     */
    const digest = {
      built: true as const,
      /*
       * What was filled in for them, in the words the reply should use.
       *
       * Without this the model cannot tell a budget they gave from one it was
       * handed, so it either says nothing -- and somebody discovers the plan
       * assumed GHS 800 when they had 300 -- or hedges about every field on
       * every plan. Naming only what was actually assumed costs one clause.
       */
      assumed: [
        args.party_size == null ? `${DEFAULTS.party_size} people` : null,
        args.budget_ghs == null ? `a GHS ${DEFAULTS.budget_ghs} budget` : null,
        args.start_time == null ? `a ${DEFAULTS.start_time} start` : null,
        args.hours == null ? `${DEFAULTS.hours} hours` : null,
      ].filter(Boolean),
      spends_ghs: itinerary.est_total_ghs,
      budget_ghs: inputs.budget,
      stops: itinerary.stops.map((s) => ({
        name: s.name,
        area: s.area,
        arrival: s.arrival_time,
        label: s.label,
        cost_ghs: s.est_cost_ghs,
        ordering: s.orders.map((o) => `${o.qty}x ${o.item}`),
      })),
      transport_ghs: itinerary.transport_total_ghs,
      price_confidence: itinerary.price_confidence?.exact
        ? "every stop priced from a menu"
        : "some stops are estimates, so give the total as a range",
      note: "The app is showing this plan on a card. Describe it in a sentence or two and do not read the stops back one by one.",
    };

    built.set(digest, { itinerary, inputs });
    return digest;
  },
};

interface ResolvedAreas {
  ids: string[];
  names: string[];
  /** The city the named areas are in. Absent means nothing was named: Accra. */
  city?: string;
}

/**
 * The areas we actually hold, from the words somebody used.
 *
 * Forgiving of case and of a partial, because "east legon" and "East Legon"
 * are the same request, but never inventive: an area with no match is reported
 * as one we do not cover rather than quietly dropped, which would look to the
 * user like we had planned their evening in the wrong half of the city.
 */
async function resolveAreas(ctx: ToolContext, wanted: string[]): Promise<ResolvedAreas> {
  if (!wanted.length) return { ids: [], names: [] };

  const { data } = await ctx.catalog.from("areas").select("id,name,city");
  const rows = (data ?? []) as { id: string; name: string; city: string | null }[];

  const ids: string[] = [];
  const names: string[] = [];
  let city: string | undefined;
  for (const w of wanted.map((a) => a.trim().toLowerCase()).filter(Boolean)) {
    for (const row of rows) {
      const name = row.name.toLowerCase();
      if ((name === w || name.includes(w) || w.includes(name)) && !ids.includes(row.id)) {
        /*
         * The first area named decides the city, and areas from any other
         * city are left out rather than planned across. "Osu and Kumasi" is
         * two outings, not one with a four-hour taxi in the middle.
         */
        const rowCity = row.city || "Accra";
        if (city && rowCity !== city) continue;
        city = rowCity;
        ids.push(row.id);
        names.push(row.name);
      }
    }
  }
  return { ids, names, city };
}

/** What the planner expects, from what somebody actually said. */
function toPlanInputs(args: BuildPlanArgs, areas: ResolvedAreas): PlanInputs {
  return {
    areaIds: areas.ids,
    areaNames: areas.names,
    city: areas.city ?? "Accra",
    // Only when they named nowhere. With areas resolved, this must be false or
    // fetchCandidates skips the area filter it was just given ids for.
    surpriseMe: areas.ids.length === 0,
    // The defaults land here rather than in the schema, so the result also
    // carries what was assumed and the reply can say so.
    partySize: args.party_size ?? DEFAULTS.party_size,
    companions: [],
    budget: args.budget_ghs ?? DEFAULTS.budget_ghs,
    date: args.date,
    startTime: args.start_time ?? DEFAULTS.start_time,
    hours: args.hours ?? DEFAULTS.hours,
    stops: args.stops,
    vibes: args.vibes ?? [],
    focus: args.focus ?? "everything",
    cuisine: args.cuisine ?? "either",
    formality: "either",
    alcohol: args.alcohol ?? "either",
    occasion: args.occasion ?? "date_night",
    occasionDetail: {},
    partner: {
      name: "",
      gender: "unspecified",
      food: "",
      place: "",
      interests: args.about_them ?? "",
      avoid: "",
    },
  };
}

/**
 * Which part could not be met.
 *
 * "I could not find anything" sends somebody away with nothing to change.
 * Being shut is named before money because no budget fixes a Monday, and a
 * thin focus is named as our gap rather than their spending.
 */
function whyNot(inputs: PlanInputs, candidates: Awaited<ReturnType<typeof fetchCandidates>>): string {
  const needed = stopCountFor(inputs.hours, inputs.focus, inputs.vibes, inputs.stops);

  const hours = openOnDate(candidates.venues, inputs.date, inputs.startTime, inputs.hours);
  if (hours.closed > 0 && hours.open + hours.unknown < needed) {
    return "Most places that would suit are shut at that hour on that day. Say so, and that another day or an earlier start would both fix it. This is not about their budget.";
  }

  const focusTypes = focusVenueTypes(inputs.focus);
  if (focusTypes.length) {
    const available = candidates.venues.filter((v) => focusTypes.includes(v.type)).length;
    if (available < needed) {
      return `We do not hold enough priced ${inputs.focus} venues for that. Say it is a gap in our catalogue rather than in their budget, and offer a mixed evening instead.`;
    }
  }

  if (candidates.venues.length < 2) {
    return "Almost nothing in the catalogue matches that area and budget together. Say which to widen; do not offer a plan.";
  }

  return `No arrangement of real venues fits GHS ${inputs.budget} for ${inputs.partySize}. Say so plainly and suggest a wider area, fewer places, or more budget.`;
}
