import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runNudges, type NudgeKind } from "@/lib/nudges";

/**
 * Weekend ideas, new this week, and "it's been a while" (src/lib/nudges.ts).
 *
 * vercel.json runs this at 15:00 every day, the one run a day a Hobby
 * account allows per job; the day decides what goes out (Friday the weekend,
 * Tuesday what's new, Wednesday the lapsed) and the other days do nothing.
 *
 * With the cron secret, ?dry=1 says who would get what without claiming or
 * sending; &kinds=weekend,new,lapsed picks the kinds whatever the day; and
 * &everyone=1 (dry only) looks past the opt-in, to read the copy before
 * anybody has turned it on.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS: NudgeKind[] = ["weekend", "new", "lapsed"];

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const asked = (url.searchParams.get("kinds") ?? "")
    .split(",")
    .filter((k): k is NudgeKind => (KINDS as string[]).includes(k));

  const run = await runNudges(createServiceClient(), new Date(), {
    dry,
    everyone: dry && url.searchParams.get("everyone") === "1",
    ...(asked.length ? { kinds: asked } : {}),
  });
  return NextResponse.json({
    dry,
    kinds: run.kinds,
    optedIn: run.optedIn,
    sending: run.messages.length,
    sent: run.sent ?? 0,
    skipped: run.skipped,
    failures: run.failures?.slice(0, 5) ?? [],
    // What went out, for the run log: the copy, never who it went to.
    copy: [...new Map(run.messages.map((m) => [`${m.nudge.kind}:${m.nudge.body}`, m.nudge])).values()].map((n) => ({
      kind: n.kind,
      title: n.title,
      body: n.body,
      url: n.url,
    })),
  });
}
