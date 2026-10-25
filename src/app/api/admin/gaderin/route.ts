import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/adminAuth";

/**
 * Place a Gaderin activity at a Duro venue, take it off one, or set it aside.
 *
 * gaderin_activities is written only by the service role (0073), so the admin
 * page comes through here rather than writing from the browser. A link takes
 * the venue's area with it, because the venue is the surer answer to where.
 * The events follow at the next daily run of scripts/scrape-gaderin.ts.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("link"), slug: z.string().min(1).max(200), venueId: z.string().uuid() }),
  z.object({ action: z.literal("unlink"), slug: z.string().min(1).max(200) }),
  z.object({ action: z.literal("dismiss"), slug: z.string().min(1).max(200), dismissed: z.boolean() }),
]);

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const body = parsed.data;

  // Events staff too (0095). These writes run as the service role, so the
  // database cannot see who made them: each one is logged here instead.
  const gate = await requireStaff(["events"]);
  if (!gate.ok) return gate.response;
  const { supabase } = gate;
  const log = async (venueId: string | null, changes: Record<string, unknown>) => {
    if (gate.isAdmin) return;
    await supabase.from("staff_edits").insert({
      user_id: gate.userId,
      table_name: "gaderin_activities",
      row_id: body.slug,
      venue_id: venueId,
      action: "update",
      changes,
    });
  };


  if (body.action === "link") {
    const { data: venue } = await supabase
      .from("venues")
      .select("id,area_id,is_active,business_status")
      .eq("id", body.venueId)
      .maybeSingle();
    if (!venue) return NextResponse.json({ error: "No such venue." }, { status: 404 });
    if (venue.business_status === "CLOSED_PERMANENTLY") {
      return NextResponse.json({ error: "That place is marked permanently closed." }, { status: 409 });
    }
    /*
     * A place switched off for want of a price is switched back on: a Gaderin
     * event is a price. The planner still withholds an unpriced venue from
     * ordinary slots, so it appears only through its events until it has a
     * price of its own.
     */
    if (!venue.is_active) {
      const { error } = await supabase.from("venues").update({ is_active: true }).eq("id", venue.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const { error } = await supabase
      .from("gaderin_activities")
      .update({ venue_id: venue.id, area_id: venue.area_id, dismissed: false })
      .eq("slug", body.slug);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await log(venue.id, { linked_to: venue.id, ...(venue.is_active ? {} : { switched_venue_on: true }) });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "unlink") {
    const { error } = await supabase.from("gaderin_activities").update({ venue_id: null }).eq("slug", body.slug);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Its future dates come off now, not at 3am: a wrong venue should not be planned tonight.
    await supabase
      .from("events")
      .update({ is_active: false })
      .like("external_key", `gaderin:${body.slug}:%`)
      .gte("event_date", new Date().toISOString().slice(0, 10));
    await log(null, { unlinked: true });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("gaderin_activities").update({ dismissed: body.dismissed }).eq("slug", body.slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await log(null, { dismissed: body.dismissed });
  return NextResponse.json({ ok: true });
}
