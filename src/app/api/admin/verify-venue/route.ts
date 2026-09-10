import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { verifyVenue } from "@/lib/verify";
import type { Venue } from "@/lib/types";

/**
 * Verify one venue against the live web and store the verdict.
 *
 * Admin-only: this spends money on every call (model tokens plus web
 * searches), so it is gated on the same is_admin flag RLS uses rather than
 * being left open to anyone who can guess the path.
 *
 * Bulk verification does NOT belong here, a thorough check takes 40-60s, so
 * a whole catalog would blow any serverless budget. Use `npm run verify:catalog`.
 */
export const maxDuration = 300;

const bodySchema = z.object({
  venueId: z.string().uuid(),
  /** Raise for ambiguous venues, chains, renames, several branches. */
  thorough: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: venue } = await supabase
    .from("venues")
    .select("*, areas(name)")
    .eq("id", body.venueId)
    .maybeSingle();

  if (!venue) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  const areaName = (venue as Venue).areas?.name ?? "Accra";
  const result = await verifyVenue(venue as Venue, areaName, {
    maxSearches: body.thorough ? 6 : 4,
    effort: body.thorough ? "high" : "medium",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const v = result.verification;

  // Persist so the catalog view can show what has been checked and when.
  // A failed write must not discard a verdict the user already paid for, so
  // the result is returned either way and the error only logged.
  const { error: writeError } = await supabase
    .from("venues")
    .update({
      verification_status: v.verdict,
      verification_confidence: v.confidence,
      verification_summary: v.summary,
      verification_sources: v.sources,
      verification_discrepancies: v.discrepancies,
      verified_at: new Date().toISOString(),
    })
    .eq("id", body.venueId);

  if (writeError) {
    console.error("could not store verification", writeError);
  }

  return NextResponse.json({
    verification: v,
    searchesUsed: result.searchesUsed,
    stored: !writeError,
  });
}
