import { NextResponse } from "next/server";
import { createFreshServiceClient } from "@/lib/supabase/server";
import { giveawayFor } from "@/lib/giveaway";
import { SITE_URL } from "@/lib/site";

/*
 * The ticket link of an event with a giveaway, opened anywhere but the
 * current app: the website, a shared link, an older app. Nobody is entered
 * here (there is no account to enter); it goes straight on to the event's
 * real ticket page, the same place it went before the giveaway.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { eventId: string } }) {
  const db = createFreshServiceClient();
  const g = /^[0-9a-f-]{36}$/i.test(params.eventId) ? await giveawayFor(db, params.eventId) : null;
  if (g) return NextResponse.redirect(g.fallback_url, 302);

  const { data } = await db.from("events").select("source_url").eq("id", params.eventId).maybeSingle();
  const source = (data as { source_url: string | null } | null)?.source_url;
  return NextResponse.redirect(source && /^https?:\/\//.test(source) ? source : `${SITE_URL}/`, 302);
}
