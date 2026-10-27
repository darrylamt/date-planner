import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, getCaller } from "@/lib/supabase/server";

/**
 * What the app does between plans, in batches (usage_events, 0097): a day's
 * first open, each planner question reached, what was searched on the Venues
 * tab or the area step and what was opened from it, "Did you go?" after a
 * saved plan, and how somebody heard about Duro!.
 *
 * Public like /api/signals, because most use is signed out; the account is
 * attached when the app sends its token. One open a day, one answer per plan
 * and one "heard from" per phone are held by unique indexes, so a repeat is
 * dropped by the database rather than counted twice. Never answers with an
 * error worth showing: a lost event costs nothing on screen.
 */
export const maxDuration = 10;

const KINDS = ["app_open", "step_viewed", "search", "venue_opened", "went", "heard_from"] as const;
const key = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/);
const word = z.string().regex(/^[a-z0-9_:.-]{1,64}$/);

const bodySchema = z.object({
  deviceId: key,
  platform: z.enum(["ios", "android", "web"]).optional(),
  appVersion: z.string().max(32).optional(),
  events: z
    .array(
      z.object({
        kind: z.enum(KINDS),
        // A step, a venue id, a plan slug, a channel: or what was typed, trimmed and lowered.
        name: z.string().trim().max(80).optional(),
        value: z.number().int().min(-1).max(100_000).optional(),
        // A few short facts about the event: where a search was, which occasion a step was for.
        data: z.record(z.union([word, z.number().int(), z.boolean()])).optional(),
        at: z.string().datetime().optional(),
      })
    )
    .min(1)
    .max(40),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { deviceId, platform, appVersion, events } = parsed.data;
  const caller = await getCaller(req).catch(() => null);
  const now = Date.now();

  const rows = events.map((e) => {
    // A time from the phone, but not one in the future or from last week.
    const at = e.at ? Date.parse(e.at) : now;
    const created = new Date(Number.isFinite(at) && at <= now && at > now - 7 * 864e5 ? at : now).toISOString();
    return {
      created_at: created,
      day: created.slice(0, 10),
      device_id: deviceId,
      user_id: caller && !caller.anonymous ? caller.id : null,
      platform: platform ?? null,
      app_version: appVersion ?? null,
      kind: e.kind,
      name: e.kind === "search" ? (e.name ?? "").toLowerCase().slice(0, 80) || null : (e.name ?? null),
      value: e.value ?? null,
      data: e.data ?? {},
    };
  });

  const db = createServiceClient();
  // One at a time where a unique index may refuse it, so one repeat does not lose the batch.
  const once = rows.filter((r) => r.kind === "app_open" || r.kind === "went" || r.kind === "heard_from");
  const rest = rows.filter((r) => !once.includes(r));
  let saved = 0;
  if (rest.length) {
    const { error } = await db.from("usage_events").insert(rest);
    if (error) {
      console.error("usage_events insert failed", error.message);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    saved += rest.length;
  }
  for (const r of once) {
    const { error } = await db.from("usage_events").insert(r);
    if (!error) saved++;
  }
  return NextResponse.json({ ok: true, saved });
}
