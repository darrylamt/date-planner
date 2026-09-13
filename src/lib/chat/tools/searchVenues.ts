import { z } from "zod";
import { VIBE_CHIP_TAGS, expandVibes } from "../../catalog";
import { VENUE_SELECT } from "../../venueColumns";
import type { Venue } from "../../types";
import type { ChatTool, ToolContext } from "./types";
import { compactVenue, isPriced, menusFor, openStateAt, type CompactVenue } from "./shared";

/**
 * Find places, the way somebody asks for them out loud.
 *
 * The read-only cousin of fetchCandidates. It shares that function's rules,
 * priced venues only, party size respected, vibe scoring, but not its purpose:
 * this answers a question, it does not build an evening, so it neither
 * reserves slots by focus type nor pulls full menus.
 *
 * The cap is the point. Eight rows of roughly sixty tokens is a search result
 * the conversation can carry; forty full venue rows is a result that makes
 * every subsequent turn expensive, since history is resent on every request.
 */
const LIMIT = 8;

const argsSchema = z.object({
  areas: z.array(z.string()).max(6).optional(),
  types: z
    .array(z.enum(["restaurant", "activity", "lounge", "outdoor", "cafe", "dessert"]))
    .max(6)
    .optional(),
  vibes: z.array(z.string()).max(6).optional(),
  cuisine: z.enum(["local", "continental"]).optional(),
  max_per_person_ghs: z.number().positive().optional(),
  party_size: z.number().int().positive().max(50).optional(),
  open_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  open_at: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
});

export type SearchVenuesArgs = z.infer<typeof argsSchema>;

export const searchVenues: ChatTool<SearchVenuesArgs> = {
  name: "search_venues",
  description:
    "Search the Accra catalogue for places that match what someone is after. " +
    "Returns at most 8, with an honest price note for each. Use this before " +
    "naming any venue: a place not in these results is not in the catalogue " +
    "and must not be mentioned.",
  parameters: {
    type: "object",
    properties: {
      areas: {
        type: "array",
        items: { type: "string" },
        description: "Neighbourhood names, e.g. Osu, Labone, East Legon. Omit to search all of Accra.",
      },
      types: {
        type: "array",
        items: { enum: ["restaurant", "activity", "lounge", "outdoor", "cafe", "dessert"] },
        description: "Kinds of venue to include.",
      },
      vibes: {
        type: "array",
        items: { type: "string" },
        // Straight from the map the plan flow's own chips use, so the tool can
        // never advertise a vibe the catalogue cannot match. It went stale
        // once already: this listed seven words while the chips offered
        // fourteen, and the missing eight matched nothing.
        description: `What kind of place. One or more of: ${Object.keys(VIBE_CHIP_TAGS).join(", ")}.`,
      },
      cuisine: {
        enum: ["local", "continental"],
        description:
          "Only pass when the person asked for it. Venues with no recorded cuisine are still returned, marked null, because unrecorded is not the same as 'neither'.",
      },
      max_per_person_ghs: {
        type: "number",
        description: "Rough ceiling per person in cedis.",
      },
      party_size: {
        type: "integer",
        description: "How many people. Filters out venues that cannot take the group.",
      },
      open_on: {
        type: "string",
        description: "ISO date yyyy-mm-dd. Adds an open/closed/unknown flag and that day's hours.",
      },
      open_at: {
        type: "string",
        description: "24h time HH:MM, used with open_on to check a specific moment.",
      },
    },
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args, ctx): Promise<{ venues: CompactVenue[]; note?: string }> {
    const venues = await load(ctx, args);
    if (!venues.length) {
      return {
        venues: [],
        note: "Nothing in the catalogue matches that. Say so plainly rather than suggesting something that does not fit.",
      };
    }

    const menus = await menusFor(ctx.catalog, venues);

    // Unpriced is withheld, not shown as free. See isPriced.
    let priced = venues.filter((v) => isPriced(v, (menus.get(v.id) ?? []).length));

    if (args.max_per_person_ghs) {
      priced = priced.filter((v) => withinBudget(v, args.max_per_person_ghs!));
    }

    if (args.open_on) {
      // Shut is removed; unknown is kept and labelled, because withholding it
      // would hide most of the catalogue over a fact nobody has recorded.
      priced = priced.filter((v) => openStateAt(v, args.open_on!, args.open_at) !== "closed");
    }

    const wanted = expandVibes(args.vibes ?? []);
    const ranked = priced
      .map((v) => ({
        v,
        score:
          (v.vibe_tags ?? []).filter((t) => wanted.includes(t)).length * 2 +
          cuisineBonus(v, args.cuisine),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, LIMIT)
      .map((s) => s.v);

    const names = new Map(venues.map((v) => [v.id, v.name]));

    return {
      venues: ranked.map((v) =>
        compactVenue(v, menus.get(v.id) ?? [], {
          date: args.open_on,
          time: args.open_at,
          ownerName: v.menu_shared_from ? names.get(v.menu_shared_from) : undefined,
        })
      ),
    };
  },
};

/**
 * The venue query itself.
 *
 * Named columns rather than "*": since 0014 the venue grant has been an
 * explicit list and Postgres refuses SELECT * outright when any one column is
 * ungranted, which took plan generation down twice. See venueColumns.ts.
 */
async function load(ctx: ToolContext, args: SearchVenuesArgs): Promise<Venue[]> {
  let q = ctx.catalog.from("venues").select(VENUE_SELECT).eq("is_active", true);

  if (args.types?.length) q = q.in("type", args.types);

  const { data, error } = await q;
  if (error) throw new Error(`venue search failed: ${error.message}`);

  let venues = (data ?? []) as unknown as Venue[];

  /*
   * Areas are matched here rather than in the query because the model sends
   * names as a person said them and the catalogue stores ids. Case-insensitive
   * and forgiving of a partial, so "east legon" and "East Legon" both land.
   */
  if (args.areas?.length) {
    const wanted = args.areas.map((a) => a.trim().toLowerCase()).filter(Boolean);
    venues = venues.filter((v) => {
      const name = (v.areas?.name ?? "").toLowerCase();
      return wanted.some((w) => name === w || name.includes(w) || w.includes(name));
    });
  }

  if (args.party_size) {
    venues = venues.filter((v) => {
      const min = Number(v.min_party_size ?? 1);
      const max = v.max_party_size == null ? Infinity : Number(v.max_party_size);
      return args.party_size! >= min && args.party_size! <= max;
    });
  }

  /*
   * Three-valued, and the null case is the whole reason this is not a plain
   * equality. A venue whose cuisine nobody has recorded is not evidence that
   * it serves the wrong kind; it is evidence of nothing, so it stays in and
   * is simply not preferred.
   */
  if (args.cuisine) {
    venues = venues.filter((v) => v.cuisine == null || v.cuisine === "both" || v.cuisine === args.cuisine);
  }

  return venues;
}

function cuisineBonus(v: Venue, wanted?: "local" | "continental"): number {
  if (!wanted) return 0;
  if (v.cuisine === wanted) return 3;
  if (v.cuisine === "both") return 1;
  return 0; // null: unrecorded, so neither rewarded nor punished.
}

/**
 * Affordable, judged against what we actually know.
 *
 * A venue priced only from its menu has no average to test, so it is kept:
 * excluding it would drop real options over a number the catalogue holds
 * elsewhere. An estimate is tested at the bottom of its range, since that is
 * the honest reading of "it might be this cheap".
 */
function withinBudget(v: Venue, ceiling: number): boolean {
  if (v.is_free) return true;
  const avg = Number(v.avg_cost_per_person_ghs) || 0;
  if (avg <= 0) return true;
  if (v.price_source === "estimated") {
    const spread = Number(v.price_spread) || 0.3;
    return avg * (1 - spread) <= ceiling;
  }
  return avg <= ceiling;
}
