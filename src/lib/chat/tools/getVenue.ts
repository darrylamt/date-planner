import { z } from "zod";
import { VENUE_SELECT } from "../../venueColumns";
import { describeWeek, parsePeriods } from "../../hours";
import { describeSchedule } from "../../schedules";
import type { MenuCategory, MenuItem, Venue, VenueSchedule } from "../../types";
import type { ChatTool } from "./types";
import { describePrice, menusFor, type PriceNote } from "./shared";

/**
 * Everything we hold about one place, including what it serves.
 *
 * The menu is summarised rather than listed. Casa1715 has 311 rows and The
 * Honeysuckle 182, and pasting either into the conversation would cost more
 * than every other turn combined, because history is resent on every request
 * that follows. A price range per category plus a sample answers "what do they
 * do here" and "can I afford it", which is what people actually ask.
 */
const SAMPLE_PER_CATEGORY = 6;

const argsSchema = z.object({
  venue_id: z.string().uuid(),
  /** Narrow the sample when the person asked about one thing. */
  category: z
    .enum(["starter", "main", "dessert", "drink", "activity", "other"])
    .optional(),
});

export type GetVenueArgs = z.infer<typeof argsSchema>;

export const getVenue: ChatTool<GetVenueArgs> = {
  name: "get_venue",
  description:
    "Full detail on one venue: what it is, what it costs, its opening hours, " +
    "and a summary of what it serves with real prices. Use the id from " +
    "search_venues. Never quote a dish or price that did not come back here.",
  parameters: {
    type: "object",
    properties: {
      venue_id: { type: "string", description: "The id from a search_venues result." },
      category: {
        enum: ["starter", "main", "dessert", "drink", "activity", "other"],
        description: "Narrow the menu sample to one course or kind.",
      },
    },
    required: ["venue_id"],
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args, ctx) {
    const { data, error } = await ctx.catalog
      .from("venues")
      .select(VENUE_SELECT)
      .eq("id", args.venue_id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw new Error(`venue lookup failed: ${error.message}`);
    if (!data) return { found: false as const, note: "No such venue in the catalogue." };

    const venue = data as unknown as Venue;

    // Follows menu_shared_from, which is the whole reason this exists rather
    // than the app's own /api/venues/[id]: that route queries menu_items by
    // venue_id directly, so a Honeysuckle branch comes back with no menu.
    const menu = (await menusFor(ctx.catalog, [venue])).get(venue.id) ?? [];

    /*
     * What the place does on a given day of the week. Recorded for very few
     * venues, so an empty list means nobody has told us rather than that the
     * bar is quiet on Thursdays, and the note below says so.
     */
    const { data: fixtureRows } = await ctx.catalog
      .from("venue_schedules")
      .select("*")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("weekday");

    const fixtures = (fixtureRows ?? []) as VenueSchedule[];

    let ownerName: string | undefined;
    if (venue.menu_shared_from) {
      const { data: owner } = await ctx.catalog
        .from("venues")
        .select("name")
        .eq("id", venue.menu_shared_from)
        .maybeSingle();
      ownerName = (owner as { name?: string } | null)?.name;
    }

    return {
      found: true as const,
      id: venue.id,
      name: venue.name,
      type: venue.type,
      area: venue.areas?.name ?? "",
      description: venue.description || null,
      vibes: venue.vibe_tags ?? [],
      good_for: venue.best_for ?? [],
      cuisine: venue.cuisine ?? null,
      dress_code: venue.dress_code ?? null,
      price: describePrice(venue, menu),
      party_size: {
        min: Number(venue.min_party_size ?? 1),
        max: venue.max_party_size ?? null,
      },
      reservation_required: Boolean(venue.reservation_required),
      /*
       * Only the approved number ever reaches here. phone_pending is not in
       * the column grant at all, so this is enforced by Postgres rather than
       * by remembering. See 0013 and 0014.
       */
      phone: venue.phone ?? null,
      /*
       * Offered so the assistant can point somebody at the place rather than
       * only describe it. The catalogue holds twenty-nine of these against a
       * hundred and eighty-five venues, so null here is the common case and
       * means nobody has found one, which is not the same as there being none.
       */
      instagram: venue.instagram_handle ?? null,
      google_maps_url: venue.google_maps_url ?? null,
      hours: hours(venue),
      whats_on_weekly: fixtures.length
        ? fixtures.map(describeSchedule)
        : "nothing recorded, which is not the same as nothing happening",
      /*
       * Two different kinds of claim, kept apart on purpose. The venue-level
       * answer came from a person who rang and asked. The per-item notes are
       * the menu's own words, quoted. Neither is an allergen statement and the
       * catalogue holds none.
       */
      vegetarian_options:
        venue.has_vegetarian_options == null
          ? "nobody has asked the venue"
          : venue.has_vegetarian_options
            ? `yes, per ${venue.dietary_source ?? "a call to the venue"}`
            : `no, per ${venue.dietary_source ?? "a call to the venue"}`,
      menu: summarise(menu, args.category),
      menu_shared_from: ownerName ?? null,
      note: guidance(venue, menu),
    };
  },
};

/**
 * The week, or an honest admission.
 *
 * Null periods mean nobody has recorded the hours. That is a third state and
 * it is returned as one: the model is told not to read it as either open or
 * shut, because most of this catalogue has no hours on file.
 */
function hours(v: Venue): { known: boolean; week?: { day: string; hours: string }[] } {
  const periods = parsePeriods(v.opening_periods);
  if (!periods) return { known: false };
  return { known: true, week: describeWeek(periods) };
}

interface CategorySummary {
  category: MenuCategory;
  count: number;
  price_range_ghs: [number, number];
  sample: { name: string; price_ghs: number; notes?: string }[];
}

function summarise(menu: MenuItem[], only?: MenuCategory): CategorySummary[] {
  const groups = new Map<MenuCategory, MenuItem[]>();
  for (const m of menu) {
    if (only && m.category !== only) continue;
    const list = groups.get(m.category) ?? [];
    list.push(m);
    groups.set(m.category, list);
  }

  const out: CategorySummary[] = [];
  for (const [category, items] of groups) {
    const prices = items.map((m) => Number(m.price_ghs)).filter((p) => p > 0);
    if (!prices.length) continue;
    prices.sort((a, b) => a - b);

    out.push({
      category,
      count: items.length,
      price_range_ghs: [Math.round(prices[0]), Math.round(prices[prices.length - 1])],
      // Cheapest first: it is the half of the menu people are deciding from
      // when they have asked what somewhere costs.
      sample: items
        .slice()
        .sort((a, b) => Number(a.price_ghs) - Number(b.price_ghs))
        .slice(0, only ? SAMPLE_PER_CATEGORY * 2 : SAMPLE_PER_CATEGORY)
        .map((m) => ({
          name: m.name,
          price_ghs: Number(m.price_ghs),
          ...(m.notes ? { notes: m.notes } : {}),
          // Printed on the menu, quoted. Not our assessment of the dish.
          ...(m.dietary_note ? { menu_says: m.dietary_note } : {}),
          ...(m.is_alcoholic === true ? { alcoholic: true } : {}),
        })),
    });
  }

  return out.sort((a, b) => b.count - a.count);
}

/**
 * Things the model would otherwise get wrong about this particular row, said
 * once, here, rather than hoped for in the system prompt.
 */
function guidance(v: Venue, menu: MenuItem[]): string | undefined {
  const notes: string[] = [];

  const price: PriceNote = describePrice(v, menu);
  if (price.basis === "estimated") {
    notes.push("This price is an estimate. Give it as a range, never as a figure.");
  }
  if (price.basis === "unknown") {
    notes.push("We have no price for this venue. Say so rather than guessing.");
  }
  if (!parsePeriods(v.opening_periods)) {
    notes.push("Opening hours are not recorded. That is not the same as closed; say we do not know.");
  }
  if (v.cuisine == null) {
    notes.push("Nobody has recorded what kind of kitchen this is. Do not infer it from the dish names.");
  }
  if (!menu.length) {
    notes.push("No menu rows on file for this venue.");
  }

  return notes.length ? notes.join(" ") : undefined;
}
