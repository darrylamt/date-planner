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
   * Zero and one are both answers, and the floor was wrong for both.
   *
   * One is a business meeting. Zero is "up to you" -- it is what STOP_OPTIONS
   * has always carried for that choice, so the questionnaire could always
   * produce it, and this schema has always refused it. It went unnoticed while
   * the field was usually absent; defaultStopsFor then started writing the 0
   * out explicitly on every occasion change, which turned a latent bug into
   * every plan failing with "Invalid plan inputs".
   *
   * The planner already reads it correctly: 0 is falsy, so stopCountFor falls
   * through to inferring from the hours, which is exactly what "up to you"
   * means.
   */
  stops: z.number().int().min(0).max(5).optional(),
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
  // Both optional, so a plan posted by an older build still validates.
  city: z.string().max(60).optional(),
  wellness: z.boolean().optional(),
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
