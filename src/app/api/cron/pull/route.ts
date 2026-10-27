import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { refreshPull } from "@/lib/pull";
import { embedChangedVenues } from "@/lib/embeddings";
import { understandMenus } from "@/lib/menuUnderstand";

/**
 * Nightly: every active venue's pull, from the last ninety days of what
 * people did with it in their plans (pull.ts). Run in the small hours so the
 * day's plans are in and nobody is planning while it writes.
 *
 * Then up to a minute's worth of venue embeddings (embeddings.ts) for places
 * whose description changed, so a person's taste reaches new venues too.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // No secret configured means nobody may call it, not everybody.
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  try {
    const db = createServiceClient();
    const pull = await refreshPull(db);
    // Embeddings failing (the free quota) must not lose the pull that worked.
    const embedded = await embedChangedVenues(db).catch((e) => ({ error: (e as Error).message }));
    // And dishes added or edited since (menuUnderstand.ts, 0096), in whatever time is left.
    const dishes = await understandMenus(db, { limit: 480, deadlineMs: 20_000 }).catch((e) => ({ error: (e as Error).message }));
    return NextResponse.json({ ok: true, ...pull, embedded, dishes });
  } catch (e) {
    console.error("pull refresh failed", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
