import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/adminAuth";
import { PlacesNotConfigured, placesConfigured } from "@/lib/places";
import { venueFromPlace } from "@/lib/venueFromPlace";

/**
 * Add a Google place as one of our venues, from inside another form: an
 * event at a place we do not hold yet, or a new stay. Events and stays staff
 * may, as well as admins (0095, 0099). A staff login's addition is logged,
 * since these writes run as the service role.
 */
export const maxDuration = 30;

const bodySchema = z.object({
  placeId: z.string().min(4).max(400),
  type: z.enum(["restaurant", "activity", "lounge", "outdoor", "cafe", "dessert", "wellness", "stay"]).optional(),
});

export async function POST(req: Request) {
  const gate = await requireStaff(["events", "stays"]);
  if (!gate.ok) return gate.response;
  if (!placesConfigured()) return NextResponse.json({ error: "Google Places is not configured." }, { status: 501 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  try {
    const result = await venueFromPlace(gate.supabase, parsed.data.placeId, { type: parsed.data.type });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    if (result.venue.created && !gate.isAdmin) {
      await gate.supabase.from("staff_edits").insert({
        user_id: gate.userId,
        table_name: "venues",
        row_id: result.venue.id,
        venue_id: result.venue.id,
        action: "insert",
        changes: { from_google_place: parsed.data.placeId, name: result.venue.name, type: result.venue.type },
      });
    }
    return NextResponse.json({ venue: result.venue });
  } catch (e) {
    if (e instanceof PlacesNotConfigured) return NextResponse.json({ error: e.message }, { status: 501 });
    return NextResponse.json({ error: (e as Error).message || "Could not add that place." }, { status: 502 });
  }
}
