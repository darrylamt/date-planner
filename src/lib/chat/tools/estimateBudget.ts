import { z } from "zod";
import { VENUE_SELECT } from "../../venueColumns";
import { allowedBands } from "../../matching";
import type { Venue } from "../../types";
import type { ChatTool } from "./types";
import { isPriced, mainsRange, menusFor } from "./shared";

/**
 * Is that budget realistic?
 *
 * Answered from the cheapest real venues in the catalogue rather than from
 * encouragement. Somebody with GHS 200 for two in Cantonments should be told
 * so before they answer seven questions and get a no_match screen, and the
 * honest answer sometimes is "not there, but yes in Osu".
 *
 * Generalises cheapestTwoStopEstimate in matching.ts, which assumes a couple.
 * Same shape, same flat transport hop, but it has to hold for a table of eight
 * and for one person on their own.
 */
const TRANSPORT_HOP_GHS = 40;

const argsSchema = z.object({
  budget_ghs: z.number().positive().optional(),
  party_size: z.number().int().positive().max(50).default(2),
  areas: z.array(z.string()).max(6).optional(),
  stops: z.number().int().min(1).max(4).default(2),
});

export type EstimateBudgetArgs = z.infer<typeof argsSchema>;

export const estimateBudget: ChatTool<EstimateBudgetArgs> = {
  name: "estimate_budget",
  description:
    "What an outing realistically costs, from the cheapest priced venues we " +
    "actually hold. Use when someone names a budget and wants to know if it " +
    "works, or asks what they need. Be honest when the answer is no.",
  parameters: {
    type: "object",
    properties: {
      budget_ghs: { type: "number", description: "What they have to spend in total, if they said." },
      party_size: { type: "integer", description: "How many people. Defaults to 2." },
      areas: {
        type: "array",
        items: { type: "string" },
        description: "Restrict to these neighbourhoods.",
      },
      stops: { type: "integer", description: "How many places they want to go. Defaults to 2." },
    },
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args, ctx) {
    const { data, error } = await ctx.catalog
      .from("venues")
      .select(VENUE_SELECT)
      .eq("is_active", true);

    if (error) throw new Error(`venue lookup failed: ${error.message}`);

    let venues = (data ?? []) as unknown as Venue[];

    if (args.areas?.length) {
      const wanted = args.areas.map((a) => a.trim().toLowerCase()).filter(Boolean);
      venues = venues.filter((v) => {
        const name = (v.areas?.name ?? "").toLowerCase();
        return wanted.some((w) => name === w || name.includes(w) || w.includes(name));
      });
    }

    venues = venues.filter((v) => {
      const min = Number(v.min_party_size ?? 1);
      const max = v.max_party_size == null ? Infinity : Number(v.max_party_size);
      return args.party_size >= min && args.party_size <= max;
    });

    const menus = await menusFor(ctx.catalog, venues);
    venues = venues.filter((v) => isPriced(v, (menus.get(v.id) ?? []).length));

    if (venues.length < args.stops) {
      return {
        feasible: false as const,
        note:
          "We do not hold enough priced venues there to cost an outing honestly. That is a gap in our catalogue, not in their budget, and it should be said that way.",
      };
    }

    /*
     * Per person, cheapest first, and "cheapest" means the cheap end of what
     * they actually serve rather than the cheapest thing on the price list.
     *
     * Taking the minimum row was measurably wrong: it put Aria Accra, a
     * lounge, at GHS 5 a head, because a bottle of water is the cheapest line
     * on its menu. Two of those made a floor of GHS 60 for an evening out for
     * two, which is true arithmetic about a number nobody could spend. The
     * category ladder in mainsRange is the same one adminCounts uses to decide
     * what a venue sells, so a bar is costed on drinks and a grill house on
     * mains.
     */
    const perPerson = venues
      .map((v) => {
        if (v.is_free) return { venue: v, cost: 0 };
        const avg = Number(v.avg_cost_per_person_ghs) || 0;
        if (avg > 0) return { venue: v, cost: avg };
        const range = mainsRange(menus.get(v.id) ?? []);
        return { venue: v, cost: range ? range[0] : 0 };
      })
      .sort((a, b) => a.cost - b.cost);

    const floorStops = perPerson.slice(0, args.stops);
    const cheapest = floorStops.reduce((a, b) => a + b.cost, 0);
    const transport = TRANSPORT_HOP_GHS * Math.max(0, args.stops - 1);
    const floor = Math.round(cheapest * args.party_size + transport);

    /*
     * A comfortable figure, not a second guess at the floor. The median of
     * what is actually on file, so "you could do it on X, most evenings here
     * land nearer Y" is two real numbers rather than one number and a margin.
     */
    const median = perPerson[Math.floor(perPerson.length / 2)]?.cost ?? 0;
    const comfortable = Math.round(median * args.stops * args.party_size + transport);

    const bands = allowedBands(args.budget_ghs ?? 0);

    return {
      feasible: true as const,
      party_size: args.party_size,
      stops: args.stops,
      cheapest_realistic_ghs: floor,
      /*
       * What that floor is actually made of, named.
       *
       * The number on its own is true and misleading: the cheapest pair is
       * often two free venues and a taxi fare, so "yes, GHS 150 works" is
       * arithmetic that would land somebody at a park and a garden when they
       * asked about dinner. Naming the stops lets the answer say what the
       * cheapest evening really is, and lets the person decide whether they
       * wanted it.
       */
      cheapest_made_of: floorStops.map((s) => ({
        venue: s.venue.name,
        area: s.venue.areas?.name ?? "",
        type: s.venue.type,
        per_person_ghs: Math.round(s.cost),
        free: Boolean(s.venue.is_free),
      })),
      comfortable_ghs: comfortable,
      transport_included_ghs: transport,
      priced_venues_considered: venues.length,
      ...(args.budget_ghs
        ? {
            budget_ghs: args.budget_ghs,
            within_budget: args.budget_ghs >= floor,
            price_bands_reachable: bands,
          }
        : {}),
      note: budgetNote(args.budget_ghs, floor, floorStops.filter((s) => s.cost === 0).length),
    };
  },
};

/**
 * What to say about the figure, given what the figure is made of.
 *
 * The awkward case is a floor built mostly from free venues. It is a real
 * number and it answers a different question from the one being asked, so the
 * model is told to quote it with its contents attached rather than as a bare
 * yes.
 */
function budgetNote(budget: number | undefined, floor: number, freeStops: number): string {
  if (budget && budget < floor) {
    return "Their budget is below the cheapest real combination we hold. Say so directly and offer a wider area or fewer stops, rather than implying it can be done.";
  }
  if (freeStops > 0) {
    return `The cheapest figure leans on ${freeStops} venue${freeStops > 1 ? "s" : ""} that cost nothing to enter, which is mostly the transport fare. Do not quote it as the price of an evening out without saying what it is made of; give the comfortable figure as the realistic one.`;
  }
  return "Transport is always an estimate. These figures come from the catalogue's own prices, so present them as a guide and not a quote.";
}
