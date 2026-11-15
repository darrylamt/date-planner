import { z } from "zod";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/adminAuth";
import { quickFlyer } from "@/lib/socialPosts";

/** The Flyer maker's quick start: a place or an event and a kind of post, to a filled-in flyer and caption. */
const query = z.object({
  kind: z.enum(["venue", "event"]),
  id: z.string().uuid(),
  type: z.enum(["spotlight", "menu", "datenight", "poster", "savedate"]),
  theme: z.enum(["rose", "night", "gold", "green"]).default("rose"),
  format: z.enum(["post", "story", "square"]).default("post"),
});

export async function GET(req: Request) {
  const auth = await requireStaff(["social"]);
  if (!auth.ok) return auth.response;
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Pick a place or an event and a kind of post." }, { status: 400 });
  const { kind, id, type, theme, format } = parsed.data;
  const made = await quickFlyer(auth.supabase, kind, id, type, theme, format);
  if (!made) return NextResponse.json({ error: "That one could not be found." }, { status: 404 });
  return NextResponse.json(made);
}
