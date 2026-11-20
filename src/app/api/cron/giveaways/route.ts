import { NextResponse } from "next/server";
import { createFreshServiceClient } from "@/lib/supabase/server";
import { drawDue } from "@/lib/giveaway";

/*
 * 19:00: any giveaway past its draw time that nobody has won by entry is
 * drawn from those who tried (src/lib/giveaway.ts). A tap after the draw
 * time does the same, so this is the backstop for a quiet evening.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  const drawn = await drawDue(createFreshServiceClient());
  return NextResponse.json({ drawn });
}
