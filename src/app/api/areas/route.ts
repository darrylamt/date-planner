import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { liveAreas } from "@/lib/coverage";

/**
 * The areas the app may offer: those with at least one venue a plan can
 * actually use (see liveAreas). Public, and cached for a few minutes at the
 * edge, because it changes only when a venue is priced or switched off.
 */
export const revalidate = 300;

export async function GET() {
  try {
    const areas = await liveAreas(createServiceClient());
    return NextResponse.json(
      { areas },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e) {
    console.error("live areas failed", e);
    return NextResponse.json({ error: "Could not list areas." }, { status: 500 });
  }
}
