import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { liveAreas } from "@/lib/coverage";
import { areaCentroids } from "@/lib/areaCentroids";

/**
 * The areas the app may offer: those with at least one venue a plan can
 * actually use (see liveAreas). Public, and cached for a few minutes at the
 * edge, because it changes only when a venue is priced or switched off.
 */
export const revalidate = 300;

export async function GET() {
  try {
    const db = createServiceClient();
    const [live, centres] = await Promise.all([liveAreas(db), areaCentroids(db)]);
    /*
     * The middle of each area, from its located venues, so the redesigned app
     * can draw them on a map (2 Nov 2026). Additive: an older app ignores it,
     * and an area with no located venue simply has none.
     */
    const at = new Map(centres.map((c) => [c.id, c]));
    const areas = live.map((a) => {
      const c = at.get(a.id);
      return c?.lat != null && c?.lng != null
        ? { ...a, lat: Math.round(c.lat * 1e4) / 1e4, lng: Math.round(c.lng * 1e4) / 1e4 }
        : a;
    });
    return NextResponse.json(
      { areas },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e) {
    console.error("live areas failed", e);
    return NextResponse.json({ error: "Could not list areas." }, { status: 500 });
  }
}
