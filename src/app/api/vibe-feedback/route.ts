import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { expandVibes } from "@/lib/catalog";

/**
 * "Does this feel Romantic?", answered under a generated plan.
 *
 * Public, like /api/issues, because most plans are built signed-out and an
 * answer from somebody without an account is worth exactly as much. Written
 * with the service role into a table nobody else can write (0081), and the
 * stops are checked against the catalogue here rather than trusted, so the
 * numbers on the admin side describe real venues.
 *
 * The same device answering the same plan again replaces its first answer:
 * tapping "Not really" and then adding why is one answer, not two.
 */
export const maxDuration = 15;

const bodySchema = z.object({
  planKey: z.string().min(6).max(64),
  deviceId: z.string().min(6).max(64),
  vibes: z.array(z.string().max(40)).min(1).max(3),
  occasion: z.string().max(40).optional(),
  venueIds: z.array(z.string().uuid()).max(8),
  fits: z.boolean(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
  }

  const {
    data: { user },
  } = await createClient().auth.getUser();
  const db = createServiceClient();

  // Only venues we hold, in the order they were shown, and their tags as they
  // stand now: the point is to compare what was asked with what was given.
  const { data: venues } = body.venueIds.length
    ? await db.from("venues").select("id, vibe_tags").in("id", body.venueIds)
    : { data: [] as { id: string; vibe_tags: string[] | null }[] };
  const tagsOf = new Map((venues ?? []).map((v) => [v.id as string, (v.vibe_tags ?? []) as string[]]));
  const venueIds = body.venueIds.filter((id) => tagsOf.has(id));
  const wanted = expandVibes(body.vibes);
  const matching = venueIds.filter((id) => tagsOf.get(id)!.some((t) => wanted.includes(t))).length;

  const reason = body.reason?.trim() || null;
  const { error } = await db.from("vibe_feedback").upsert(
    {
      user_id: user?.id ?? null,
      device_id: body.deviceId,
      plan_key: body.planKey,
      vibes: body.vibes,
      occasion: body.occasion ?? null,
      venue_ids: venueIds,
      matching_stops: matching,
      fits: body.fits,
      reason,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id,plan_key" }
  );

  if (error) {
    console.error("vibe feedback insert failed", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
