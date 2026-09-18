import { z } from "zod";
import type { SavedPlan } from "../../types";
import type { ChatTool, ToolContext } from "./types";

/**
 * Where this person has already been.
 *
 * The one question the catalogue tools cannot answer. "Somewhere we have not
 * been", "what did we do for her birthday last year", "not that place again"
 * are all ordinary things to say to a concierge and all of them need the
 * user's own history, which nothing else here can see.
 *
 * Read through the service role and filtered to ctx.userId in the query. Not
 * because RLS would allow otherwise, but because this tool exists to read one
 * person's private history and the filter should be visible in the line that
 * does it rather than inferred from which client was passed in.
 */
const argsSchema = z.object({
  /** Cap on how far back to look, in months. */
  months: z.number().int().min(1).max(36).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export type PastOutingsArgs = z.infer<typeof argsSchema>;

export const listPastOutings: ChatTool<PastOutingsArgs> = {
  name: "list_past_outings",
  description:
    "The plans this person has already saved: where they went, when, and what it " +
    "cost. Use when they ask for somewhere new, refer to a previous outing, or " +
    "when avoiding a repeat would obviously help. Returns nothing for somebody " +
    "who has never saved a plan, which is not the same as them never going out.",
  parameters: {
    type: "object",
    properties: {
      months: { type: "integer", description: "How far back to look. Defaults to twelve." },
      limit: { type: "integer", description: "How many plans. Defaults to eight." },
    },
    required: [],
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args, ctx: ToolContext) {
    const months = args.months ?? 12;
    const limit = args.limit ?? 8;

    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const { data, error } = await ctx.admin
      .from("plans")
      .select("share_slug, inputs, itinerary, estimated_total_ghs, created_at")
      .eq("user_id", ctx.userId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`past outings lookup failed: ${error.message}`);

    const plans = (data ?? []) as unknown as SavedPlan[];

    if (!plans.length) {
      return {
        outings: [],
        note:
          "They have not saved any plans. Do not treat that as never having gone out, and do not ask them to list places they have been.",
      };
    }

    /*
     * Named once each, newest first.
     *
     * Somebody who went to the same bar four times does not need it listed
     * four times, and the question being answered is "have we been here", for
     * which the count matters more than the repetition.
     */
    const seen = new Map<string, { name: string; area: string; times: number; last: string }>();
    for (const plan of plans) {
      for (const stop of plan.itinerary.stops ?? []) {
        const at = seen.get(stop.venue_id);
        if (at) at.times += 1;
        else {
          seen.set(stop.venue_id, {
            name: stop.name,
            area: stop.area,
            times: 1,
            last: plan.inputs.date,
          });
        }
      }
    }

    return {
      outings: plans.map((p) => ({
        date: p.inputs.date,
        occasion: p.inputs.occasion,
        party_size: p.inputs.partySize,
        spent_ghs: Math.round(Number(p.estimated_total_ghs)),
        stops: (p.itinerary.stops ?? []).map((s) => s.name),
      })),
      /*
       * The list the "somewhere new" question is really about. Handed over
       * already deduplicated so the model does not have to work it out from
       * the outings above and get it wrong.
       */
      venues_already_visited: [...seen.values()].sort((a, b) => b.times - a.times),
      note:
        "A saved plan is what they intended, not proof they went. Say 'you planned' rather than 'you went' unless they say otherwise.",
    };
  },
};
