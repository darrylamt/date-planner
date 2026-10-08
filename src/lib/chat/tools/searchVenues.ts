import { z } from "zod";
import { CUISINE_KINDS, VIBE_CHIP_TAGS, expandVibes } from "../../catalog";
import { VENUE_SELECT } from "../../venueColumns";
import type { Venue } from "../../types";
import type { ChatTool, ToolContext } from "./types";
import { compactVenue, describePrice, isPriced, keywordHits, keywordPatterns, menusFor, openStateAt, type CompactVenue } from "./shared";

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
/** The most a ranking may return: "top 10" is the usual ask, with a little room. */
const MAX_LIMIT = 15;
/** Fewer Google reviews than this and a rating says little, so it is not ranked on. */
const MIN_REVIEWS = 20;

type Sort = "best_match" | "most_expensive" | "cheapest" | "top_rated";
/** Google's rating, selected with the venue (VENUE_SELECT) though not on the Venue type. */
type Rated = Venue & { place_rating?: number | null; place_rating_count?: number | null };

const argsSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  areas: z.array(z.string()).max(6).optional(),
  city: z.string().max(60).optional(),
  types: z
    .array(z.enum(["restaurant", "activity", "lounge", "outdoor", "cafe", "dessert", "wellness"]))
    .max(6)
    .optional(),
  vibes: z.array(z.string()).max(6).optional(),
  cuisine: z.enum(["local", "continental"]).optional(),
  serves: z.string().min(2).max(40).optional(),
  max_per_person_ghs: z.number().positive().optional(),
  party_size: z.number().int().positive().max(50).optional(),
  open_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  open_at: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  sort: z.enum(["best_match", "most_expensive", "cheapest", "top_rated"]).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  keywords: z.string().max(60).optional(),
});

export type SearchVenuesArgs = z.infer<typeof argsSchema>;

export const searchVenues: ChatTool<SearchVenuesArgs> = {
  name: "search_venues",
  description:
    "Search the Accra catalogue for places that match what someone is after, " +
    "or rank them: the most expensive, the cheapest, the top rated. " +
    "Returns 8 by default and up to 15 when asked, with an honest price note for each. Use this before " +
    "naming any venue: a place not in these results is not in the catalogue " +
    "and must not be mentioned.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Look a venue up by name, whole or partial. Always use this when somebody names a place: without it the search returns only the best few matches for a mood, and a venue that exists but did not rank can look like one we do not hold.",
      },
      city: {
        type: "string",
        description:
          "The city to search in. Defaults to Accra. Only set it when the person names another city, such as Kumasi.",
      },
      areas: {
        type: "array",
        items: { type: "string" },
        description: "Neighbourhood names, e.g. Osu, Labone, East Legon. Omit to search all of Accra.",
      },
      types: {
        type: "array",
        items: { enum: ["restaurant", "activity", "lounge", "outdoor", "cafe", "dessert", "wellness"] },
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
      serves: {
        type: "string",
        description:
          `A specific kitchen, when somebody names one: ${CUISINE_KINDS.join(", ")}. ` +
          "Very few venues have this recorded, so an empty result means nobody has written it down rather than that no such place exists. Say that difference out loud.",
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
      sort: {
        enum: ["best_match", "most_expensive", "cheapest", "top_rated"],
        description:
          "How to order the results. most_expensive and cheapest rank by the typical price per person (the middle main on the menu, or the middle of an estimate); places with no price are left out. top_rated ranks by Google rating, only for places with at least 20 reviews. Use these for 'top 10 most expensive', 'cheapest places', 'best rated' questions. Default best_match.",
      },
      limit: {
        type: "integer",
        description: "How many to return, up to 15. Set it when somebody asks for a number, e.g. 10 for a top 10.",
      },
      keywords: {
        type: "string",
        description:
          "A feature somebody asked for in their own words, e.g. rooftop, football, brunch, beach, pool, shisha. Matched against each venue's name, description, tags and menu. Only venues that match are returned.",
      },
    },
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args, ctx): Promise<{ venues: (CompactVenue & { rating?: number | null; reviews?: number; matched_on?: string })[]; note?: string }> {
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

    /*
     * Asked for by a feature, in the person's own words.
     *
     * Vibe chips could not say "rooftop" or "somewhere to watch the
     * football", so those searches came back as lively lounges in general,
     * and the bot either missed Mad Skyz, a rooftop it had described itself
     * two questions earlier, or asked what kind of outing was meant. The words
     * are matched against what the catalogue says about each place, its menu
     * included, so "brunch" finds the cafes that serve one.
     *
     * A menu match is weaker than a description and is reported as one, with
     * the dish that matched: "beach" finds a Sex on the Beach on a cocktail
     * list, and the model can only discard that if it can see it.
     */
    const words = keywordPatterns(args.keywords, KEYWORD_STOP, KEYWORD_ALSO);
    const keywordScore = new Map<string, number>();
    const matchedOn = new Map<string, string>();
    if (words.length) {
      for (const v of priced) {
        const said = [v.name, v.description, ...(v.vibe_tags ?? []), ...(v.best_for ?? []), ...(v.cuisines ?? [])]
          .filter(Boolean)
          .join(" ");
        const described = keywordHits(words, said);
        const dish = described ? undefined : (menus.get(v.id) ?? []).find((i) => keywordHits(words, i.name) > 0);
        if (described) {
          keywordScore.set(v.id, described * 2);
          matchedOn.set(v.id, "how the venue is described");
        } else if (dish) {
          keywordScore.set(v.id, 1);
          matchedOn.set(v.id, `only a menu item: ${dish.name}`);
        }
      }
      priced = priced.filter((v) => keywordScore.has(v.id));
    }

    if (args.max_per_person_ghs) {
      priced = priced.filter((v) => withinBudget(v, args.max_per_person_ghs!));
    }

    if (args.open_on) {
      // Shut is removed; unknown is kept and labelled, because withholding it
      // would hide most of the catalogue over a fact nobody has recorded.
      priced = priced.filter((v) => openStateAt(v, args.open_on!, args.open_at) !== "closed");
    }

    // A name lookup is a lookup, not a shortlist: if six branches match, all
    // six are the answer.
    const asked = Math.min(MAX_LIMIT, args.limit ?? LIMIT);
    const limit = args.name ? Math.max(asked, priced.length) : asked;
    const sort: Sort = args.sort ?? "best_match";

    /*
     * Ranked, when the question is a ranking.
     *
     * The search could only order by how well a place matched a mood, so
     * "the ten most expensive restaurants in Accra" came back as eight places
     * in no particular order, and the bot rightly would not invent a ranking.
     * A first question like that, answered "I can't", reads as a useless bot.
     * Price ranks on the same typical figure the bot quotes for each place,
     * so the order and the prices it gives can never disagree.
     */
    const perHead = (v: Venue) => {
      const p = describePrice(v, menus.get(v.id) ?? []);
      if (p.basis === "menu") return p.typical_per_person_ghs;
      if (p.basis === "estimated") return (p.per_person_range_ghs[0] + p.per_person_range_ghs[1]) / 2;
      if (p.basis === "free") return 0;
      return null;
    };
    const rating = (v: Venue) =>
      Number((v as Rated).place_rating_count ?? 0) >= MIN_REVIEWS && (v as Rated).place_rating != null ? Number((v as Rated).place_rating) : null;

    const wanted = expandVibes(args.vibes ?? []);
    const match = (v: Venue) =>
      (keywordScore.get(v.id) ?? 0) * 3 +
      (v.vibe_tags ?? []).filter((t) => wanted.includes(t)).length * 2 +
      cuisineBonus(v, args.cuisine);

    let pool = priced;
    let rankedBy: string | undefined;
    if (sort === "most_expensive" || sort === "cheapest") {
      pool = priced.filter((v) => perHead(v) != null && (sort === "cheapest" || perHead(v)! > 0));
      rankedBy = "typical price per person: the middle main course on the menu, or the middle of an estimate";
    } else if (sort === "top_rated") {
      pool = priced.filter((v) => rating(v) != null);
      rankedBy = `Google rating, among places with at least ${MIN_REVIEWS} reviews`;
    }
    const ranked = pool
      .map((v) => ({ v, score: match(v), per: perHead(v) ?? 0, stars: rating(v) ?? 0 }))
      .sort((a, b) =>
        sort === "most_expensive"
          ? b.per - a.per
          : sort === "cheapest"
            ? a.per - b.per
            : sort === "top_rated"
              ? b.stars - a.stars || Number((b.v as Rated).place_rating_count ?? 0) - Number((a.v as Rated).place_rating_count ?? 0)
              : b.score - a.score
      )
      .slice(0, limit)
      .map((s) => s.v);

    const names = new Map(venues.map((v) => [v.id, v.name]));

    return {
      venues: ranked.map((v) => ({
        ...compactVenue(v, menus.get(v.id) ?? [], {
          date: args.open_on,
          time: args.open_at,
          ownerName: v.menu_shared_from ? names.get(v.menu_shared_from) : undefined,
        }),
        ...(sort === "top_rated" ? { rating: rating(v), reviews: Number((v as Rated).place_rating_count ?? 0) } : {}),
        ...(matchedOn.has(v.id) ? { matched_on: matchedOn.get(v.id) } : {}),
      })),
      ...(rankedBy
        ? {
            note: `Ranked by ${rankedBy}, ${sort === "cheapest" ? "lowest" : "highest"} first. Only places we hold a price${sort === "top_rated" ? " and a rating" : ""} for are ranked; say so in a few words.`,
          }
        : {}),
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

  /*
   * One city at a time, for the reason plans are: nothing used to read
   * areas.city, so a question about somewhere romantic could be answered with
   * a restaurant in Kumasi. Named areas imply their own city and are left to
   * speak for themselves; otherwise the search stays in the one asked for.
   */
  if (!args.areas?.length) {
    const { data: cityAreas } = await ctx.catalog
      .from("areas")
      .select("id")
      .eq("city", args.city?.trim() || "Accra");
    const ids = ((cityAreas ?? []) as { id: string }[]).map((a) => a.id);
    if (ids.length) q = q.in("area_id", ids);
  }

  if (args.types?.length) q = q.in("type", args.types);

  /*
   * Asked for by name.
   *
   * Without this the only way to reach a venue was to out-rank sixty others on
   * a mood, and the model reported anything that did not make the top eight as
   * absent from the catalogue. Casa1715, three hundred menu rows and all, came
   * back as "not among the venues Duro holds". Denying something real is a
   * worse failure than any amount of hedging: it is the product's one promise,
   * inverted.
   */
  if (args.name) {
    const needle = args.name.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`);
    q = q.ilike("name", `%${needle}%`);
  }

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
   * Matched against what the venue is recorded as serving, not guessed from
   * its dishes. A venue with nothing recorded is dropped from a search that
   * named a kitchen rather than kept and hoped over: "we have not recorded
   * anywhere Korean" is a true sentence, and "here is somewhere that might be"
   * is not.
   */
  if (args.serves) {
    const want = args.serves.trim().toLowerCase();
    venues = venues.filter((v) =>
      (v.cuisines ?? []).some((k) => k.toLowerCase().includes(want) || want.includes(k.toLowerCase()))
    );
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

/** Words that say nothing a type or vibe does not already say. */
const KEYWORD_STOP = new Set([
  "bar", "bars", "place", "places", "spot", "spots", "restaurant", "restaurants", "lounge", "lounges",
  "somewhere", "good", "best", "nice", "with", "the", "and", "for", "accra", "can", "where", "watch",
]);

/** The obvious other ways a place describes the same thing. */
const KEYWORD_ALSO: Record<string, string[]> = {
  football: ["sport", "screen"],
  soccer: ["football", "sport", "screen"],
  sports: ["sport"],
  rooftop: ["roof"],
  kids: ["family", "children", "kid"],
  children: ["family", "kid"],
  family: ["kid", "children"],
  pool: ["swim"],
};

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
