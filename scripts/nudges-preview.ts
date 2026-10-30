/**
 * What the nudges would say (src/lib/nudges.ts), without sending anything:
 * this week's weekend pick, what's new, and the lapsed line, then who would
 * get what today among everyone with a phone to send to, opted in or not.
 * npm run nudges:preview [YYYY-MM-DD]
 */
import { createClient } from "@supabase/supabase-js";
import { lapsedNudge, newThisWeekNudge, runNudges, weekendNudge, weekendOf } from "../src/lib/nudges";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

(async () => {
  const day = process.argv[2];
  const now = day ? new Date(`${day}T15:00:00Z`) : new Date();
  const friday = new Date(`${weekendOf(now)[0]}T15:00:00Z`);

  const show = (label: string, n: { title: string; body: string; url: string } | null) =>
    console.log(`${label}\n  ${n ? `${n.title}\n  ${n.body}\n  -> ${n.url}` : "(nothing to say, so not sent)"}\n`);

  show(`Weekend, as sent on Friday ${friday.toISOString().slice(0, 10)}:`, await weekendNudge(db, friday));
  show("New this week:", await newThisWeekNudge(db, now));
  show("It's been a while (usually date nights):", lapsedNudge("date_night", now));

  const run = await runNudges(db, now, { dry: true, everyone: true, kinds: ["weekend", "new", "lapsed"] });
  console.log(`Today, among ${run.optedIn} people with a phone to send to (opt-in ignored):`);
  const byKind = new Map<string, number>();
  for (const m of run.messages) byKind.set(m.nudge.kind, (byKind.get(m.nudge.kind) ?? 0) + 1);
  console.log("  would get:", Object.fromEntries(byKind), " skipped:", run.skipped);

  const { data, error } = await db.from("notification_prefs").select("user_id").eq("nudges", true);
  console.log(error ? "\nnotification_prefs is missing: run migration 0100." : `\nOpted in so far: ${(data ?? []).length}`);
})();
