import { z } from "zod";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/adminAuth";

/** Admin → Social → Venue outreach: where the conversation with one venue is (0116). */
const body = z.object({
  venueId: z.string().uuid(),
  status: z.enum(["todo", "messaged", "agreed", "posting", "declined"]),
  notes: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const auth = await requireStaff(["social"]);
  if (!auth.ok) return auth.response;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That did not look right." }, { status: 400 });
  const { venueId, status, notes } = parsed.data;
  const { error } = await auth.supabase
    .from("venue_outreach")
    .upsert({ venue_id: venueId, status, notes: notes?.trim() || null, updated_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: "venue_id" });
  if (error) return NextResponse.json({ error: /venue_outreach/.test(error.message) ? "Run migration 0116 first." : error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
