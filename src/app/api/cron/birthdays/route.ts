import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendExpoPush, tokensForUsers, type PushMessage } from "@/lib/pushServer";

/**
 * "Today be the day dem born you."
 *
 * The one notification that is not about a plan. It asks nothing, sells
 * nothing and takes one line, which is the only shape a birthday message from
 * an app is ever welcome in.
 *
 * ── in pidgin, on purpose ───────────────────────────────────────────────
 * This is an Accra app and that is how the greeting is actually said here. A
 * notification that sounds like a form letter from a bank is one people turn
 * off; this one sounds like somebody who knows them.
 *
 * ── why it cannot fire twice ────────────────────────────────────────────
 * birthday_greetings keys on (user_id, year) and the row is claimed before the
 * push, exactly as the plan reminder does. A second attempt fails the insert,
 * and that failure is the answer. Nobody gets wished happy birthday four times
 * between six and nine in the morning.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Morning, so it lands before the day starts rather than during it. */
const FROM_HOUR = 6;
const TO_HOUR = 9;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // No secret configured means nobody may call it, not everybody.
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  // Ghana keeps GMT all year, so UTC is the local calendar and there is no
  // timezone arithmetic anywhere in this file.
  const now = new Date();
  const hour = now.getUTCHours();
  if (hour < FROM_HOUR || hour > TO_HOUR) {
    return NextResponse.json({ skipped: "outside the morning window", hour });
  }

  const supabase = createServiceClient();

  const day = now.getUTCDate();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  /*
   * 29 February, greeted on the 28th in years that do not have one.
   *
   * Storing the day as given and moving the greeting is what people do
   * themselves, and it is kinder than the alternative, which is somebody born
   * on the leap day hearing from us once every four years.
   */
  const isLastOfFeb = month === 2 && day === 28 && !isLeap(year);
  const days = isLastOfFeb ? [28, 29] : [day];

  const { data: birthdayRows, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("birth_month", month)
    .in("birth_day", days);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const people = (birthdayRows ?? []) as { id: string; display_name: string | null }[];
  if (!people.length) return NextResponse.json({ date: `${day}/${month}`, greeted: 0 });

  const tokensFor = await tokensForUsers(supabase, people.map((p) => p.id));

  const messages: PushMessage[] = [];
  let greeted = 0;

  for (const person of people) {
    const tokens = tokensFor.get(person.id) ?? [];
    if (!tokens.length) continue;

    // Claimed before sending, for the same reason the plan reminder is.
    const { error: claimError } = await supabase
      .from("birthday_greetings")
      .insert({ user_id: person.id, year, delivered: tokens.length });
    if (claimError) continue;

    greeted += 1;
    /*
     * The name only where there is one. "Happy Birthday null" is the kind of
     * thing that gets screenshotted, and the greeting reads perfectly well
     * without it.
     */
    const name = person.display_name?.trim().split(/\s+/)[0];
    for (const token of tokens) {
      messages.push({
        to: token,
        title: "Today be the day dem born you",
        body: name
          ? `Happy Birthday ${name}. Make we plan something?`
          : "Happy Birthday. Make we plan something?",
        // Straight into planning, since that is the only thing being offered.
        data: { url: "/plan/new?occasion=birthday&fresh=1" },
      });
    }
  }

  if (!messages.length) {
    return NextResponse.json({ date: `${day}/${month}`, birthdays: people.length, sent: 0 });
  }

  const { sent, failures } = await sendExpoPush(messages);

  if (failures.length) console.warn(`birthday push: ${failures.length} failed`, failures.slice(0, 5));

  return NextResponse.json({
    date: `${day}/${month}`,
    birthdays: people.length,
    greeted,
    sent,
    failed: failures.length,
  });
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
