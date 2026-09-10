import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { ensureAreaId } from "@/lib/areas";
import {
  PlacesNotConfigured,
  bandFromPriceLevel,
  discoverPlaces,
  placesConfigured,
  venueTypeFromPlace,
} from "@/lib/places";

/**
 * Find venues in an area, and add the ones worth having.
 *
 * The catalogue was built from names someone already knew, which caps it at
 * one person's memory of the city. This turns the job into triage.
 *
 * Discovered venues are created deliberately incomplete: no price, no menu, no
 * vibe tags. They land in the unpriced queue and cannot reach a plan until a
 * human gives them a price, because Google knows a place exists but not what
 * an evening there costs.
 */
export const maxDuration = 60;

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("search"),
    what: z.string().min(2).max(80),
    area: z.string().min(2).max(80),
  }),
  z.object({
    action: z.literal("add"),
    area: z.string().min(2).max(80),
    places: z
      .array(
        z.object({
          id: z.string().min(4),
          name: z.string().min(1),
          address: z.string().default(""),
          lat: z.number().nullable().default(null),
          lng: z.number().nullable().default(null),
          priceLevel: z.string().nullable().default(null),
          primaryType: z.string().nullable().default(null),
          types: z.array(z.string()).default([]),
        })
      )
      .min(1)
      .max(30),
  }),
]);

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  if (!placesConfigured()) {
    return NextResponse.json(
      { error: "Google Places is not configured. Add GOOGLE_PLACES_API_KEY." },
      { status: 501 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { supabase } = gate;

  try {
    if (body.action === "search") {
      const found = await discoverPlaces(body.what, body.area);

      // Mark what we already hold, by place id and by name, so the list shows
      // twenty results rather than twenty results minus the ones you cannot
      // tell apart from what you have.
      const { data: existing } = await supabase
        .from("venues")
        .select("google_place_id, name");

      const haveIds = new Set(
        (existing ?? []).map((v: { google_place_id: string | null }) => v.google_place_id).filter(Boolean)
      );
      const haveNames = new Set(
        (existing ?? []).map((v: { name: string }) => v.name.trim().toLowerCase())
      );

      return NextResponse.json({
        results: found.map((p) => ({
          ...p,
          already: haveIds.has(p.id) || haveNames.has(p.name.trim().toLowerCase()),
        })),
      });
    }

    /* ── add ── */
    const area = await ensureAreaId(supabase, body.area);
    if (!area) {
      return NextResponse.json({ error: "Could not resolve that area." }, { status: 400 });
    }

    let added = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (const p of body.places) {
      const { data: clash } = await supabase
        .from("venues")
        .select("id")
        .eq("google_place_id", p.id)
        .maybeSingle();

      if (clash) {
        skipped++;
        continue;
      }

      const { error } = await supabase.from("venues").insert({
        name: p.name,
        area_id: area.id,
        // Left to the admin when Google's type does not map cleanly; a wrong
        // default here quietly puts a bar in the dinner slot.
        type: venueTypeFromPlace(p.primaryType, p.types) ?? "restaurant",
        price_band: bandFromPriceLevel(p.priceLevel) ?? "mid",
        // No price on purpose. Google has no menu, and a venue with no price
        // is withheld from planning rather than treated as free.
        avg_cost_per_person_ghs: 0,
        description: "",
        vibe_tags: [],
        best_for: [],
        reservation_required: false,
        is_active: true,
        lat: p.lat,
        lng: p.lng,
        google_place_id: p.id,
        business_status: "OPERATIONAL",
        price_level: p.priceLevel,
        places_synced_at: new Date().toISOString(),
      });

      if (error) failures.push(`${p.name}: ${error.message}`);
      else added++;
    }

    return NextResponse.json({ added, skipped, failures, areaCreated: area.created });
  } catch (e) {
    if (e instanceof PlacesNotConfigured) {
      return NextResponse.json({ error: e.message }, { status: 501 });
    }
    console.error("discovery failed", e);
    return NextResponse.json(
      { error: (e as Error).message ?? "Discovery failed." },
      { status: 502 }
    );
  }
}
