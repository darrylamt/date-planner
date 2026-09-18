import { z } from "zod";
import { VENUE_SELECT_FLAT } from "../../venueColumns";
import type { Venue } from "../../types";
import type { ChatTool, ToolContext } from "./types";

/**
 * Ask a venue to hold a table.
 *
 * Lodges the request in reservation_requests, which is the system of record
 * the admin queue and the venue's own portal both read. It does not talk to
 * the venue: nothing here can open somebody's WhatsApp, and a tool that
 * claimed to have messaged a restaurant would be the worst possible thing in
 * this product to be wrong about.
 *
 * So it returns the number instead, and the prompt's standing rule that
 * nothing is ever "booked", "reserved" or "confirmed" does the rest. A request
 * is logged and a person still has to ring. Saying so is the whole feature.
 */
const argsSchema = z.object({
  venue_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{1,2}:\d{2}$/),
  party_size: z.number().int().min(1).max(20),
  guest_name: z.string().max(60).optional(),
});

export type RequestReservationArgs = z.infer<typeof argsSchema>;

export const requestReservation: ChatTool<RequestReservationArgs> = {
  name: "request_reservation",
  description:
    "Log a request for a table at one venue. Use only when they have asked to " +
    "book somewhere specific and have given a date, a time and how many people. " +
    "This records the request and hands back the venue's number; it does not " +
    "contact anybody, so never say a table is booked, held or confirmed.",
  parameters: {
    type: "object",
    properties: {
      venue_id: { type: "string", description: "The id from search_venues." },
      date: { type: "string", description: "ISO date, yyyy-mm-dd." },
      time: { type: "string", description: "24h time HH:MM." },
      party_size: { type: "integer", description: "How many people, including them." },
      guest_name: { type: "string", description: "A name for the table, if they gave one." },
    },
    required: ["venue_id", "date", "time", "party_size"],
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args, ctx: ToolContext) {
    /*
     * Through the anon-level client, so the phone gate is Postgres's job
     * rather than this file's: phone_pending is not in the column grant at
     * all, and an unapproved number cannot be read here even by mistake.
     */
    const { data, error } = await ctx.catalog
      .from("venues")
      .select(VENUE_SELECT_FLAT)
      .eq("id", args.venue_id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw new Error(`venue lookup failed: ${error.message}`);

    const venue = data as unknown as Venue | null;
    if (!venue) {
      return {
        logged: false as const,
        reason: "That venue is not in the catalogue. Do not log a request against an id we do not hold.",
      };
    }

    const min = Number(venue.min_party_size ?? 1);
    const max = venue.max_party_size == null ? Infinity : Number(venue.max_party_size);
    if (args.party_size < min || args.party_size > max) {
      return {
        logged: false as const,
        reason: `${venue.name} takes groups of ${min}${max === Infinity ? " or more" : ` to ${max}`}. Say so rather than lodging a request they will be turned away from.`,
      };
    }

    const { error: writeError } = await ctx.admin.from("reservation_requests").insert({
      venue_id: venue.id,
      venue_name: venue.name,
      user_id: ctx.userId,
      party_size: args.party_size,
      reservation_date: args.date,
      arrival_time: args.time,
      guest_name: args.guest_name ?? null,
      channel: "chat",
    });

    if (writeError) throw new Error(`could not log the request: ${writeError.message}`);

    const whatsapp = (venue as { whatsapp_phone?: string | null }).whatsapp_phone ?? null;

    return {
      logged: true as const,
      venue: venue.name,
      date: args.date,
      time: args.time,
      party_size: args.party_size,
      /*
       * Both numbers, labelled, because they mean different things. Most of
       * these lines are answered rather than messaged, and a booking sent into
       * a WhatsApp account that does not exist fails without telling anybody.
       */
      call: venue.phone ?? null,
      whatsapp,
      note:
        "Logged on our side only. Nobody at the venue has been contacted yet, so tell them to " +
        (whatsapp ? "message or ring" : "ring") +
        " to confirm, and give them the number. Never say the table is booked or held.",
    };
  },
};
