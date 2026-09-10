import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { ingestMenu, suggestAvgCost, VENUE_TYPES } from "@/lib/ingest";
import { ensureAreaId } from "@/lib/areas";

/**
 * Read a menu (images and/or a URL) into a structured venue + menu items.
 *
 * Admin-only: vision requests over several images are the most expensive call
 * in this codebase, and the output writes to the catalog.
 */
export const maxDuration = 300;

const ACCEPTED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Roughly 4MB of raw image once base64 is decoded. */
const MAX_IMAGE_B64 = 5_600_000;

const bodySchema = z.object({
  venueName: z.string().min(1).max(200),
  areaName: z.string().min(1).max(120),
  venueType: z.enum(VENUE_TYPES).optional(),
  menuUrl: z.string().url().max(600).optional().or(z.literal("")),
  notes: z.string().max(1000).optional(),
  images: z
    .array(
      z.object({
        mediaType: z.string().refine((m) => ACCEPTED_MEDIA.includes(m), {
          message: "Images must be JPEG, PNG, WebP or GIF.",
        }),
        data: z.string().max(MAX_IMAGE_B64, "Each image must be under about 4MB."),
      })
    )
    .max(8, "At most 8 images per venue.")
    .default([]),
});

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    const message =
      e instanceof z.ZodError ? e.issues[0]?.message : "Invalid request.";
    return NextResponse.json({ error: message ?? "Invalid request." }, { status: 400 });
  }

  // A new neighbourhood is created rather than refused: the venue's location
  // IS an area, and failing here made adding somewhere new a two-step job.
  const area = await ensureAreaId(supabase, body.areaName);
  if (!area) {
    return NextResponse.json(
      { error: `Could not resolve or create the area "${body.areaName}".` },
      { status: 400 }
    );
  }

  const result = await ingestMenu({
    venueName: body.venueName,
    areaName: body.areaName,
    venueType: body.venueType,
    menuUrl: body.menuUrl || undefined,
    images: body.images,
    notes: body.notes,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ...result.result,
    // Derived here, not by the model, so the number is reproducible from the
    // items an admin can see on screen.
    // A per-hour or per-group venue has no per-person average to suggest, // suggestAvgCost returns 0 for it rather than treating a shared rate as
    // what one person pays.
    suggested_avg_cost: suggestAvgCost(result.result.items, result.result.venue),
  });
}
