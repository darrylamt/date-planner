import { z } from "zod";
import { VENUE_SELECT } from "../../venueColumns";
import { describeWeek, parsePeriods, weekdayOf } from "../../hours";
import type { Venue } from "../../types";
import type { ChatTool } from "./types";
import { hoursOn, openStateAt } from "./shared";

/**
 * Is it open then?
 *
 * Three answers, never two. Most of the catalogue has no hours on file, and
 * the whole point of this tool is that "we do not know" comes back as its own
 * state rather than being rounded to whichever of open or shut sounds more
 * helpful. Rounding it down sends someone to a locked door; rounding it up
 * hides half the catalogue behind a fact nobody ever recorded.
 */
const argsSchema = z.object({
  venue_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
});

export type CheckOpeningHoursArgs = z.infer<typeof argsSchema>;

export const checkOpeningHours: ChatTool<CheckOpeningHoursArgs> = {
  name: "check_opening_hours",
  description:
    "Whether a venue is open on a given date, and optionally at a given time. " +
    "Answers open, closed, or unknown. Unknown means nobody has recorded the " +
    "hours: report it as not known, never as closed and never as open.",
  parameters: {
    type: "object",
    properties: {
      venue_id: { type: "string", description: "The id from a search_venues result." },
      date: { type: "string", description: "ISO date, yyyy-mm-dd." },
      time: { type: "string", description: "24h time HH:MM. Omit to ask only about the day." },
    },
    required: ["venue_id", "date"],
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args, ctx) {
    const { data, error } = await ctx.catalog
      .from("venues")
      .select(VENUE_SELECT)
      .eq("id", args.venue_id)
      .maybeSingle();

    if (error) throw new Error(`venue lookup failed: ${error.message}`);
    if (!data) return { found: false as const, note: "No such venue in the catalogue." };

    const venue = data as unknown as Venue;
    const state = openStateAt(venue, args.date, args.time);
    const weekday = weekdayOf(args.date);

    return {
      found: true as const,
      venue: venue.name,
      date: args.date,
      ...(args.time ? { time: args.time } : {}),
      /** "open" | "closed" | "unknown" */
      state,
      hours_that_day: hoursOn(venue, args.date),
      weekday:
        weekday === null
          ? null
          : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday],
      week: parsePeriods(venue.opening_periods) ? describeWeek(parsePeriods(venue.opening_periods)) : null,
      note:
        state === "unknown"
          ? "We have no opening hours for this venue. Say that plainly. Suggest calling ahead if a number is on file."
          : undefined,
    };
  },
};
