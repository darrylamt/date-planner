import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Report that aduro itself is broken.
 *
 * Its sibling at /api/reports takes reports about a venue: the price moved,
 * the door was locked. This takes reports about the app, which until now had
 * nowhere to go. Chat spent an unknown stretch telling paying subscribers they
 * were out of messages, and it was found because the person who runs aduro hit
 * it himself.
 *
 * Public for the same reason that one is: a broken sign-in or a failed
 * purchase is invisible to a form that requires an account, and those are the
 * reports most worth having.
 */
export const maxDuration = 15;

const bodySchema = z.object({
  area: z.enum(["chat", "plan", "account", "payment", "other"]),
  message: z.string().min(1).max(2000),
  /**
   * Whatever the app knew: the conversation in hand, the error last shown, the
   * build. Capped and whitelisted rather than taken wholesale, because this
   * arrives from a client and is read later by a person who will reasonably
   * assume it describes the app and not whatever someone chose to send.
   */
  context: z
    .object({
      conversationId: z.string().uuid().optional(),
      planId: z.string().uuid().optional(),
      lastError: z.string().max(400).optional(),
      screen: z.string().max(60).optional(),
      platform: z.string().max(40).optional(),
      appVersion: z.string().max(40).optional(),
      buildNumber: z.string().max(40).optional(),
    })
    .strict()
    .optional(),
  deviceId: z.string().min(6).max(64).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }

  const message = body.message.trim();
  if (!message) return NextResponse.json({ error: "Invalid report." }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("issue_reports").insert({
    area: body.area,
    message,
    context: body.context ?? {},
    reporter_id: user?.id ?? null,
    reporter_device: body.deviceId ?? null,
    status: "open",
  });

  if (error) {
    console.error("issue report insert failed", error);
    return NextResponse.json({ error: "Could not send that report." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
