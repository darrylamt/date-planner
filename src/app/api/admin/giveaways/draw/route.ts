import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/adminAuth";
import { drawOne, giveawayFor } from "@/lib/giveaway";

/* Admin → Giveaways → Draw now: pick one of those who tried, now. */
export const dynamic = "force-dynamic";

const Body = z.object({ eventId: z.string().uuid() });

export async function POST(req: Request) {
  const gate = await requireStaff([]);
  if (!gate.ok) return gate.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Which giveaway?" }, { status: 400 });

  const g = await giveawayFor(gate.supabase, parsed.data.eventId);
  if (!g) return NextResponse.json({ error: "No giveaway on that event." }, { status: 404 });
  if (g.winner_user_id) return NextResponse.json({ error: "It already has a winner." }, { status: 409 });

  const after = await drawOne(gate.supabase, g);
  if (!after?.winner_user_id) return NextResponse.json({ error: "Nobody has entered yet, so there is nobody to draw." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
