import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, getCaller } from "@/lib/supabase/server";

/**
 * What people do with the places in their plans, in batches from the app
 * (plan_signals, 0089): shown, swapped away, saved, shared, menu opened,
 * Book tapped, time on a venue's page.
 *
 * Public, like /api/vibe-feedback, because most plans are made signed out and
 * an anonymous swap says as much about a venue as a signed-in one. The
 * account is attached when the app sends its token. Venues are checked
 * against the catalogue rather than trusted, and a batch is capped, so the
 * pull rates built from this describe real places and cannot be flooded by
 * one request. Never answers with an error worth showing: losing a signal
 * costs nothing on screen.
 */
export const maxDuration = 10;

const KINDS = [
  "shown",
  "swapped_away",
  "swapped_in",
  "saved",
  "shared",
  "details_opened",
  "menu_opened",
  "book_tapped",
  "directions_tapped",
  "maps_opened",
  "instagram_opened",
  "venue_viewed",
] as const;

const key = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/);
const bodySchema = z.object({
  deviceId: key,
  events: z
    .array(
      z.object({
        kind: z.enum(KINDS),
        venueId: z.string().uuid(),
        planKey: key.optional(),
        occasion: z.string().regex(/^[a-z_]{1,32}$/).optional(),
        value: z.number().int().min(0).max(3_600_000).optional(),
        at: z.string().datetime().optional(),
      })
    )
    .min(1)
    .max(60),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { deviceId, events } = parsed.data;

  const caller = await getCaller(req).catch(() => null);
  const db = createServiceClient();

  // Only venues we hold.
  const ids = [...new Set(events.map((e) => e.venueId))];
  const { data: known } = await db.from("venues").select("id").in("id", ids);
  const real = new Set(((known ?? []) as { id: string }[]).map((v) => v.id));

  const now = Date.now();
  const rows = events
    .filter((e) => real.has(e.venueId))
    .map((e) => {
      // A time from the phone, but not one in the future or from last week.
      const at = e.at ? Date.parse(e.at) : now;
      const created = Number.isFinite(at) && at <= now && at > now - 7 * 864e5 ? new Date(at).toISOString() : new Date(now).toISOString();
      return {
        created_at: created,
        device_id: deviceId,
        user_id: caller?.id ?? null,
        venue_id: e.venueId,
        kind: e.kind,
        plan_key: e.planKey ?? null,
        occasion: e.occasion ?? null,
        value: e.kind === "venue_viewed" ? (e.value ?? null) : null,
      };
    });
  if (!rows.length) return NextResponse.json({ ok: true, saved: 0 });

  const { error } = await db.from("plan_signals").insert(rows);
  if (error) {
    console.error("plan_signals insert failed", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: rows.length });
}
