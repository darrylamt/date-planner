import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ingestMenu, suggestAvgCost, VENUE_TYPES } from "@/lib/ingest";

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
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    const message =
      e instanceof z.ZodError ? e.issues[0]?.message : "Invalid request.";
    return NextResponse.json({ error: message ?? "Invalid request." }, { status: 400 });
  }

  // The area must already exist — the generated migration resolves it by name.
  const { data: area } = await supabase
    .from("areas")
    .select("name")
    .eq("name", body.areaName)
    .maybeSingle();

  if (!area) {
    return NextResponse.json(
      { error: `No area named "${body.areaName}". Create it first at /admin/areas.` },
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
    suggested_avg_cost: suggestAvgCost(result.result.items),
  });
}
