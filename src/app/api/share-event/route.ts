import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

/*
 * One anonymous event on the way from a shared plan to the app. See migration
 * 0070. Always answers 204, whatever happened: a visitor's tap must never wait
 * on, or fail over, our statistics.
 */
const eventSchema = z.object({
  kind: z.enum(["view", "plan_your_own", "app_store"]),
  page: z.enum(["shared_plan", "get", "home", "name_poll"]),
  // The share slug's own alphabet and length (randomSlug in format.ts).
  slug: z
    .string()
    .regex(/^[a-z2-9]{10}$/)
    .optional(),
});

const done = () => new NextResponse(null, { status: 204 });

export async function POST(req: Request) {
  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(await req.json());
  } catch {
    return done();
  }

  try {
    const db = createServiceClient();
    let occasion: string | null = null;
    if (event.slug) {
      const { data } = await db.from("plans").select("inputs").eq("share_slug", event.slug).maybeSingle();
      // A slug no plan carries is somebody guessing; it is not a share.
      if (!data) return done();
      occasion = (data.inputs as { occasion?: string } | null)?.occasion ?? null;
    }
    await db.from("share_events").insert({
      kind: event.kind,
      page: event.page,
      plan_slug: event.slug ?? null,
      occasion,
    });
  } catch {
    /* never a failed tap over statistics */
  }
  return done();
}
