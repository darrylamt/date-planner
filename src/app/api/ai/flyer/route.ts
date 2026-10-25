import { NextResponse } from "next/server";
import { z } from "zod";
import { aiCaller, takeRead } from "@/lib/aiAllowance";
import { ownImage } from "@/lib/gemini";
import { readFlyer } from "@/lib/flyerReader";

/**
 * Read an event poster that has just been uploaded, to fill the event form.
 *
 * For planners, venue accounts and admins. Given the poster's URL in our own
 * storage, which the upload already put there; never fetches from anywhere
 * else (ownImage). Writes nothing: the form shows what was read.
 */
export const maxDuration = 60;

const bodySchema = z.object({ imageUrl: z.string().url().max(500) });

export async function POST(req: Request) {
  const caller = await aiCaller();
  if (!caller || (!caller.admin && !caller.planner && !caller.venueIds.length && !caller.staff.includes("events"))) {
    return NextResponse.json({ error: "Poster reading is for planner and venue accounts." }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const image = await ownImage(parsed.data.imageUrl);
  if (!image) return NextResponse.json({ error: "Couldn't open that poster. Upload it again." }, { status: 400 });

  const allowed = await takeRead(caller, "flyer");
  if (!allowed.ok) return NextResponse.json({ error: allowed.message }, { status: 429 });

  const r = await readFlyer(image);
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.reason === "limit" ? 429 : 502 });
  if (!r.data.isEvent) {
    return NextResponse.json({ error: "That doesn't look like an event poster, so nothing was filled in." }, { status: 422 });
  }
  return NextResponse.json({ draft: r.data, model: r.model });
}
