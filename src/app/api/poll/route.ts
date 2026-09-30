import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { CHOICES, cleanName, fixedOptionFor, isAllowedName, nameKey, pollClosed, type PollResults } from "@/lib/namePoll";

/**
 * The name poll.   GET: the counts and the suggested names.   POST: one vote.
 *
 * A name typed under "Other" joins the poll for everybody after, with its
 * vote: GET lists every such name with how many have picked it, so the next
 * person can vote for it too. Typed names that are really one of the five
 * ("duro") count for that option. Hidden names (from the admin page) are
 * left out of what the public sees.
 *
 * A device may vote three times in a day, not once, because a household or
 * an office shares one network address, and the hash is of address and
 * browser together.
 */
export const dynamic = "force-dynamic";

const vote = z.object({
  choice: z.enum(CHOICES as [string, ...string[]]),
  other: z.string().trim().max(40).optional(),
  suggestion: z.string().trim().max(1000).optional(),
});

async function results(): Promise<PollResults> {
  const db = createServiceClient();
  const [{ data, error }, { data: hidden }] = await Promise.all([
    db.from("name_poll_votes").select("choice, other_name"),
    db.from("name_poll_hidden").select("name_key"),
  ]);
  if (error) throw error;
  const off = new Set((hidden ?? []).map((h: { name_key: string }) => h.name_key));
  const counts: Record<string, number> = Object.fromEntries(CHOICES.map((c) => [c, 0]));
  const byKey = new Map<string, { name: string; votes: number }>();
  for (const r of (data ?? []) as { choice: string; other_name: string | null }[]) {
    counts[r.choice] = (counts[r.choice] ?? 0) + 1;
    if (r.choice !== "Other" || !r.other_name) continue;
    const key = nameKey(r.other_name);
    if (!key || off.has(key)) continue;
    const cur = byKey.get(key) ?? { name: cleanName(r.other_name), votes: 0 };
    cur.votes++;
    byKey.set(key, cur);
  }
  const suggested = [...byKey.values()].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  return { counts, suggested, total: (data ?? []).length };
}

export async function GET() {
  try {
    return NextResponse.json(await results(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The poll is not open yet." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  // The countdown on the page is only honest if the server keeps to it too.
  if (pollClosed()) return NextResponse.json({ error: "Voting has closed." }, { status: 403 });
  let body: z.infer<typeof vote>;
  try {
    body = vote.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Pick a name first." }, { status: 400 });
  }

  let choice = body.choice;
  let other: string | null = null;
  if (choice === "Other") {
    const typed = cleanName(body.other ?? "");
    if (!typed) return NextResponse.json({ error: "Type the name you have in mind." }, { status: 400 });
    const fixed = fixedOptionFor(typed);
    if (fixed) choice = fixed;
    else if (!isAllowedName(typed)) {
      return NextResponse.json(
        { error: "That name cannot go in the poll. Try letters and numbers, and keep it friendly." },
        { status: 400 }
      );
    } else other = typed;
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ua = req.headers.get("user-agent") ?? "";
  const salt = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "aduro").slice(-24);
  const voter = createHash("sha256").update(`${salt}|${ip}|${ua}`).digest("hex");

  try {
    const db = createServiceClient();
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await db
      .from("name_poll_votes")
      .select("id", { count: "exact", head: true })
      .eq("voter_hash", voter)
      .gte("created_at", since);
    if ((count ?? 0) >= 3) {
      return NextResponse.json({ error: "You have voted already today. Thank you!", ...(await results()) }, { status: 429 });
    }
    const { error } = await db.from("name_poll_votes").insert({
      choice,
      other_name: other,
      suggestion: body.suggestion || null,
      voter_hash: voter,
    });
    if (error) throw error;
    return NextResponse.json({ ...(await results()), counted: { choice, other } });
  } catch {
    return NextResponse.json({ error: "Could not save your vote. Try again in a moment." }, { status: 503 });
  }
}
