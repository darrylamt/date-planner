import { NextResponse } from "next/server";
import { z } from "zod";
import { createFreshServiceClient, getCaller } from "@/lib/supabase/server";
import { enterGiveaway, giveawayFor } from "@/lib/giveaway";

/*
 * A tap on Tickets for an event with a giveaway (src/lib/giveaway.ts). The
 * app sends the account's token; the answer is always a page to open, so a
 * person who cannot enter still gets their ticket page.
 *
 *   signin         not signed in, or an anonymous session: not entered
 *   notifications  no device that can be told: not entered
 *   won            their ticket page
 *   anything else  the event's normal ticket page
 */
export const dynamic = "force-dynamic";

const Body = z.object({ eventId: z.string().uuid() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Which event?" }, { status: 400 });

  const db = createFreshServiceClient();
  const g = await giveawayFor(db, parsed.data.eventId);
  if (!g) return NextResponse.json({ status: "none", url: null });

  const caller = await getCaller(req).catch(() => null);
  if (!caller || caller.anonymous) return NextResponse.json({ status: "signin", url: g.fallback_url });

  const { data: token } = await db.from("push_tokens").select("token").eq("user_id", caller.id).limit(1).maybeSingle();
  if (!token) return NextResponse.json({ status: "notifications", url: g.fallback_url });

  const result = await enterGiveaway(db, g, caller.id);
  return NextResponse.json(result);
}
