import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  venueId: z.string().uuid(),
  venueName: z.string().min(1).max(200),
  planSlug: z.string().max(64).nullable().optional(),
  partySize: z.number().int().min(1).max(20).default(2),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  arrivalTime: z.string().min(1).max(20),
  guestName: z.string().max(60).optional().default(""),
});

/**
 * Log a reservation request. Delivery to the venue happens via WhatsApp on
 * the client; this row is the system of record (and the future venue portal).
 */
export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid reservation request." }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("reservation_requests")
    .insert({
      venue_id: body.venueId,
      venue_name: body.venueName,
      user_id: user?.id ?? null,
      plan_slug: body.planSlug ?? null,
      party_size: body.partySize,
      reservation_date: body.date,
      arrival_time: body.arrivalTime,
      guest_name: body.guestName || null,
      status: "requested",
      channel: "whatsapp",
    })
    .select("id")
    .single();

  if (error) {
    console.error("reservation insert failed", error);
    return NextResponse.json({ error: "Could not log the reservation." }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
