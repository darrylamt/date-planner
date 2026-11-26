import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/adminAuth";

/*
 * Admin -> Event listings (0118): approve a listing read from a ticketing
 * site into an event, at the venue the reviewer chose, booked on that site;
 * or reject it. Approving the same listing twice updates its event.
 */
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    id: z.string().uuid(),
    venueId: z.string().uuid(),
    category: z.string().regex(/^[a-z_]{2,30}$/),
    price: z.number().min(0).max(100000).nullable(),
  }),
  z.object({ action: z.literal("reject"), id: z.string().uuid() }),
]);

export async function POST(req: Request) {
  const gate = await requireStaff(["events"]);
  if (!gate.ok) return gate.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Something in that form isn't right." }, { status: 400 });
  const db = gate.supabase;
  const b = parsed.data;

  const { data: l } = await db.from("ticket_listings").select("*").eq("id", b.id).maybeSingle();
  if (!l) return NextResponse.json({ error: "That listing is gone." }, { status: 404 });

  if (b.action === "reject") {
    await db.from("ticket_listings").update({ status: "rejected", reviewed_by: gate.userId, reviewed_at: new Date().toISOString() }).eq("id", b.id);
    return NextResponse.json({ ok: true });
  }

  if (!l.starts_at) return NextResponse.json({ error: "This listing has no date." }, { status: 400 });
  const { data: v } = await db.from("venues").select("id, area_id").eq("id", b.venueId).maybeSingle();
  if (!v) return NextResponse.json({ error: "Choose a venue from the catalogue." }, { status: 400 });

  // UTC is Accra's time all year: the day and the hour read straight off it.
  const starts = new Date(l.starts_at).toISOString();
  const row = {
    title: l.title,
    venue_id: v.id,
    area_id: v.area_id,
    event_date: starts.slice(0, 10),
    start_time: starts.slice(11, 16),
    cost_ghs: b.price,
    category: b.category,
    booking_url: l.url,
    source_url: l.url,
    organiser_name: l.organiser,
    is_active: true,
    external_key: `${l.source}:${l.slug}`,
  };
  const { data: ev, error } = await db.from("events").upsert(row, { onConflict: "external_key" }).select("id").single();
  if (error || !ev) return NextResponse.json({ error: `The event didn't save: ${error?.message ?? "unknown"}` }, { status: 500 });

  await db
    .from("ticket_listings")
    .update({ status: "approved", event_id: ev.id, reviewed_by: gate.userId, reviewed_at: new Date().toISOString(), price_ghs: b.price })
    .eq("id", b.id);
  return NextResponse.json({ ok: true, eventId: ev.id });
}
