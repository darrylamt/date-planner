import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { allow, clientIp, rateKey } from "@/lib/rateLimit";
import { sendExpoPush, tokensForUsers, type PushMessage } from "@/lib/pushServer";
import { longDate } from "@/lib/format";

/**
 * "I'm in" or "Can't make it" from the person a plan was shared with (0107).
 *
 * The page has no account, so the server writes for it: one answer per
 * browser per plan (a random id the browser keeps, stored only as a keyed
 * hash), changed in place if they answer again. The planner is told by push
 * the first time and whenever the answer changes, and never twice for the
 * same answer. A plan whose day has passed takes no more answers.
 */
const bodySchema = z.object({
  // The share slug's own alphabet and length (randomSlug in format.ts).
  slug: z.string().regex(/^[a-z2-9]{10}$/),
  answer: z.enum(["in", "cant"]),
  name: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
  visitor: z.string().regex(/^[A-Za-z0-9_-]{12,64}$/),
});

type PlanResponseResult = { ok: true } | { ok: false; message: string };

export async function POST(req: Request): Promise<NextResponse<PlanResponseResult>> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "That didn't send. Try again." }, { status: 400 });
  const body = parsed.data;

  const ip = clientIp(req);
  if (ip && !(await allow(rateKey("rsvp:ip", ip), 3600, 30))) {
    return NextResponse.json({ ok: false, message: "That's a lot of answers. Give it a few minutes." }, { status: 429 });
  }

  const db = createServiceClient();
  const { data: plan } = await db.from("plans").select("id, user_id, inputs").eq("share_slug", body.slug).maybeSingle();
  if (!plan) return NextResponse.json({ ok: false, message: "That plan isn't there any more." }, { status: 404 });
  const date = (plan.inputs as { date?: string } | null)?.date ?? "";
  // Accra keeps GMT all year: the plan's day, and the day after for a late night.
  if (date && Date.parse(`${date}T00:00:00Z`) + 2 * 86_400_000 < Date.now()) {
    return NextResponse.json({ ok: false, message: "That plan's day has passed." }, { status: 410 });
  }

  const visitor = rateKey("rsvp:visitor", body.visitor);
  const name = body.name || null;
  const note = body.note || null;
  const { data: before } = await db.from("plan_responses").select("id, answer").eq("plan_id", plan.id).eq("visitor", visitor).maybeSingle();
  const { error } = await db
    .from("plan_responses")
    .upsert({ plan_id: plan.id, visitor, answer: body.answer, name, note, updated_at: new Date().toISOString() }, { onConflict: "plan_id,visitor" });
  if (error) {
    // Before 0107 has run there is nowhere to keep it.
    return NextResponse.json({ ok: false, message: "That didn't send. Try again in a moment." }, { status: 503 });
  }

  // Tell the planner: the first answer, or a changed one.
  if (plan.user_id && (!before || before.answer !== body.answer)) {
    try {
      const tokens = (await tokensForUsers(db, [plan.user_id])).get(plan.user_id) ?? [];
      const who = name ?? "Your guest";
      const day = date ? longDate(date) : "your plan";
      const messages: PushMessage[] = tokens.map((to) => ({
        to,
        title: body.answer === "in" ? `${who} is in` : `${who} can't make it`,
        body:
          body.answer === "in"
            ? `For ${day}. ${note ? `"${note}"` : "Open your plan."}`
            : note
              ? `"${note}"`
              : `For ${day}. Open your plan to change the day or the places.`,
        // Opens the plan itself, as its reminder does.
        data: { url: `/plan/${body.slug}`, slug: body.slug },
      }));
      if (messages.length) await sendExpoPush(messages);
    } catch {
      /* the answer is kept either way; the plan shows it */
    }
  }
  return NextResponse.json({ ok: true });
}
