import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { researchVenue } from "@/lib/research";

/**
 * Research a venue by name and return a draft row.
 *
 * Nothing is written here. The draft goes back to the form for a human to
 * correct and save, because the whole point is to remove the typing, not the
 * judgement — and a research pass that wrote straight to the catalogue would
 * be a way to fill the table with plausible mistakes at speed.
 *
 * Costs money on every call (model tokens plus web searches), so it sits
 * behind the same admin gate as verification.
 */
export const maxDuration = 300;

const bodySchema = z.object({
  name: z.string().min(2).max(120),
  areaHint: z.string().max(120).optional().default(""),
  /** Raise for ambiguous venues — chains, renames, several branches. */
  thorough: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await researchVenue(body.name, body.areaHint, {
    maxSearches: body.thorough ? 7 : 5,
    effort: body.thorough ? "high" : "medium",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ draft: result.draft });
}
