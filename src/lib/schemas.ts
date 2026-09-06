import { z } from "zod";
import { BUDGET_MAX, BUDGET_MIN } from "./budget";

export const planInputsSchema = z.object({
  areaIds: z.array(z.string().uuid()).default([]),
  areaNames: z.array(z.string()).default([]),
  surpriseMe: z.boolean().default(false),
  budget: z.number().min(BUDGET_MIN).max(BUDGET_MAX),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  hours: z.number().min(1).max(12),
  vibes: z.array(z.string()).min(1).max(3),
  occasion: z.enum(["first_date", "anniversary", "date_night", "friend_outing"]),
  partner: z.object({
    name: z.string().max(60).default(""),
    pronoun: z.enum(["they", "she", "he"]).default("they"),
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
  est_cost_for_two_ghs: z.number().min(0),
  why_this_fits: z.string(),
  image_url: z.string().nullable().default(null),
  google_maps_url: z.string().nullable().optional(),
  reservation_required: z.boolean().optional(),
  reservation_requested: z.boolean().optional(),
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
