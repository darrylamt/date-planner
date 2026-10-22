import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { refreshPull } from "@/lib/pull";

/**
 * Nightly: every active venue's pull, from the last ninety days of what
 * people did with it in their plans (pull.ts). Run in the small hours so the
 * day's plans are in and nobody is planning while it writes.
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
    return NextResponse.json({ ok: true, ...(await refreshPull(createServiceClient())) });
  } catch (e) {
    console.error("pull refresh failed", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
