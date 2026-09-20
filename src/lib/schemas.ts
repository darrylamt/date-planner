import { z } from "zod";
import { BUDGET_MAX, BUDGET_MIN } from "./budget";

export const planInputsSchema = z.object({
  areaIds: z.array(z.string().uuid()).default([]),
  areaNames: z.array(z.string()).default([]),
  surpriseMe: z.boolean().default(false),
  partySize: z.number().int().min(1).max(20).default(2),
  companions: z.array(z.string().max(60)).max(20).default([]),
  budget: z.number().min(BUDGET_MIN).max(BUDGET_MAX),
  // Optional, so a plan posted by an older build of the app still validates.
  // A zero budget counts as driving regardless; see isDriving in budget.ts.
  driving: z.boolean().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  hours: z.number().min(1).max(12),
  // Optional: a plan built before this was asked carries no value, and the
  // planner falls back to reading it off the duration.
  /*
   * One, because one is now an answer.
   *
   * The floor was two here as well as in the planner, and this is the copy
   * that decides whether a request is even heard: a business meeting posting
   * stops: 1 was refused as invalid input before any of the planner's own
   * floors were reached.
   */
  stops: z.number().int().min(1).max(5).optional(),
  alcohol: z.enum(["either", "none"]).optional(),
  vibes: z.array(z.string()).min(1).max(3),
  // Defaulted rather than required: a plan posted by an older build of the
  // app still has to be plannable.
  focus: z.enum(["everything", "food", "drinks", "activities"]).default("everything"),
  // Defaulted, so a plan posted by an older build of the app still validates.
  cuisine: z.enum(["either", "local", "continental"]).default("either"),
  formality: z.enum(["either", "casual", "fancy"]).default("either"),
  occasion: z.enum([
    "first_date",
    "anniversary",
    "date_night",
    "friend_outing",
    "birthday",
    "graduation",
    "celebration",
    "solo_day",
    /*
     * Kept in step with the Occasion union by hand, and this is the copy that
     * bites: an occasion missing here is rejected at the door with "Invalid
     * plan inputs", however well the planner would have handled it. Both of
     * these were added to the type, the constants, the themes, the mascots and
     * the planner, and would still have failed on every request.
     */
    "business_meeting",
    "family_day",
  ]),
  occasionDetail: z.record(z.string().max(300)).default({}),
  partner: z.object({
    name: z.string().max(60).default(""),
    gender: z.enum(["unspecified", "female", "male"]).default("unspecified"),
    food: z.string().max(300).default(""),
    place: z.string().max(300).default(""),
    interests: z.string().max(300).default(""),
    avoid: z.string().max(500).default(""),
  }),
});

export const itineraryOrderSchema = z.object({
  item: z.string(),
  qty: z.number().int().min(1).max(10),
  price_ghs: z.number().min(0),
});

export const itineraryStopSchema = z.object({
  venue_id: z.string(),
  kind: z.enum(["venue", "event"]).default("venue"),
  name: z.string(),
  area: z.string(),
  arrival_time: z.string(),
  duration_mins: z.number().min(15).max(360),
  label: z.string(),
  what_to_do: z.string().default(""),
  orders: z.array(itineraryOrderSchema).default([]),
  est_cost_ghs: z.number().min(0),
  why_this_fits: z.string(),
  image_url: z.string().nullable().default(null),
  google_maps_url: z.string().nullable().optional(),
  reservation_required: z.boolean().optional(),
  reservation_requested: z.boolean().optional(),
  alternates: z
    .array(
      z.object({
        venue_id: z.string(),
        name: z.string(),
        area: z.string(),
        image_url: z.string().nullable().default(null),
        google_maps_url: z.string().nullable().default(null),
        reservation_required: z.boolean().default(false),
        orders: z.array(itineraryOrderSchema).default([]),
        est_cost_ghs: z.number().min(0),
        why_this_fits: z.string().default(""),
      })
    )
    .optional(),
});

export const itinerarySchema = z.object({
  title: z.string(),
  date: z.string(),
  summary_route: z.string(),
  stops: z.array(itineraryStopSchema).min(2).max(4),
  hops: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        mins: z.number(),
        cost_ghs: z.number(),
      })
    )
    .default([]),
  food_total_ghs: z.number(),
  transport_total_ghs: z.number(),
  est_total_ghs: z.number(),
  budget_note: z.string().nullable().default(null),
  personal_summary: z.string().default(""),
});
