import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { SavedPlan } from "@/lib/types";

/**
 * "Dinner at Buka at six, then Republic." Sent the evening before.
 *
 * The most useful notification this app can send and the least intrusive: it
 * arrives when the plan is about to matter, it is made entirely of things the
 * person chose, and there is nothing to sell in it.
 *
 * ── run hourly, send once ───────────────────────────────────────────────
 * Ghana keeps GMT all year, so UTC is the local clock and no timezone
 * arithmetic is needed anywhere in this file. The job is scheduled hourly and
 * does nothing outside the evening window, which means a missed hour is caught
 * by the next one rather than lost.
 *
 * Sending once is enforced by the database rather than by reasoning about
 * time. plan_notifications has (plan_id, kind) as its primary key, so the
 * insert fails on a second attempt and that failure is the answer. Written
 * before the push rather than after: a send we are unsure about is better
 * skipped than repeated, because the failure mode of the other order is
 * somebody's phone buzzing every hour all night.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Expo's own endpoint. No SDK: it is one POST and a JSON body. */
const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

/** Sent between these hours the evening before. */
const FROM_HOUR = 18;
const TO_HOUR = 21;

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export async function GET(req: Request) {
  /*
   * Vercel signs its own cron calls with this header. Checked because the
   * route is otherwise a public URL that sends notifications to strangers, and
   * "nobody will guess the path" is not an access control.
   */
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Not authorised." }, { status: 401 });
    }
  }

  const now = new Date();
  const hour = now.getUTCHours();
  if (hour < FROM_HOUR || hour > TO_HOUR) {
    return NextResponse.json({ skipped: "outside the evening window", hour });
  }

  const supabase = createServiceClient();

  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const date = tomorrow.toISOString().slice(0, 10);

  /*
   * Plans for tomorrow, by the date inside inputs rather than created_at: the
   * question is when the evening is, not when it was planned.
   */
  const { data: rows, error } = await supabase
    .from("plans")
    .select("id, user_id, share_slug, inputs, itinerary")
    .eq("inputs->>date", date);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const plans = (rows ?? []) as unknown as (SavedPlan & { id: string })[];
  if (!plans.length) return NextResponse.json({ date, plans: 0, sent: 0 });

  const userIds = [...new Set(plans.map((p) => p.user_id).filter(Boolean))] as string[];
  const { data: tokenRows } = await supabase
    .from("push_tokens")
    .select("token, user_id")
    .in("user_id", userIds);

  const tokensFor = new Map<string, string[]>();
  for (const t of (tokenRows ?? []) as { token: string; user_id: string }[]) {
    tokensFor.set(t.user_id, [...(tokensFor.get(t.user_id) ?? []), t.token]);
  }

  const messages: PushMessage[] = [];
  const claimed: string[] = [];

  for (const plan of plans) {
    const tokens = plan.user_id ? (tokensFor.get(plan.user_id) ?? []) : [];
    if (!tokens.length) continue;

    /*
     * Claim it first. If this insert fails the reminder has already gone out,
     * possibly in an earlier hour of the same evening, and the right response
     * is to move on silently rather than to send a second one.
     */
    const { error: claimError } = await supabase
      .from("plan_notifications")
      .insert({ plan_id: plan.id, kind: "eve", delivered: tokens.length });
    if (claimError) continue;

    claimed.push(plan.id);
    const body = describe(plan);
    for (const token of tokens) {
      messages.push({
        to: token,
        title: "Tomorrow evening",
        body,
        // Opens the plan itself rather than the app's front door.
        data: { url: `/plan/${plan.share_slug}`, slug: plan.share_slug },
      });
    }
  }

  if (!messages.length) {
    return NextResponse.json({ date, plans: plans.length, sent: 0 });
  }

  /*
   * A hundred at a time, which is Expo's documented limit for one request.
   * Sending them singly would work and would also be one HTTP round trip per
   * device on a job with a sixty second ceiling.
   */
  let sent = 0;
  const failures: string[] = [];

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
      const json = (await res.json()) as { data?: { status: string; message?: string }[] };
      for (const ticket of json.data ?? []) {
        if (ticket.status === "ok") sent += 1;
        else failures.push(ticket.message ?? "unknown");
      }
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
  }

  /*
   * Recorded, not acted on. A token that fails once may be a phone that is off
   * rather than an install that is gone, and deleting on the first failure is
   * how somebody stops getting reminders because they flew somewhere. Expo's
   * receipts are the right place to prune from, which is a later job.
   */
  if (failures.length) {
    console.warn(`reminder push: ${failures.length} failed`, failures.slice(0, 5));
  }

  return NextResponse.json({
    date,
    plans: plans.length,
    reminded: claimed.length,
    sent,
    failed: failures.length,
  });
}

/**
 * The evening in one line.
 *
 * Two names and a time, because a notification is read at a glance on a lock
 * screen and the plan itself is one tap away. Listing five stops would make it
 * a paragraph nobody finishes.
 */
function describe(plan: SavedPlan): string {
  const stops = plan.itinerary.stops ?? [];
  if (!stops.length) return "Your plan is tomorrow.";

  const first = stops[0];
  const opening = `${first.name} at ${first.arrival_time}`;

  if (stops.length === 1) return `${opening}. Tap for the details.`;
  if (stops.length === 2) return `${opening}, then ${stops[1].name}.`;
  return `${opening}, then ${stops[1].name} and ${stops.length - 2} more.`;
}
