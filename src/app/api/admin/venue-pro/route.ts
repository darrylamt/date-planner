import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Turn Portal Pro on until a date, or off (venue_pro, 0094). Set by hand
 * until venues can pay in the portal.
 */
export const dynamic = "force-dynamic";

const body = z.object({
  venueId: z.string().uuid(),
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  note: z.string().trim().max(200).optional(),
});

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { venueId, until, note } = parsed.data;

  const { error } = until
    ? await gate.supabase
        .from("venue_pro")
        .upsert({ venue_id: venueId, until, note: note ?? null, updated_at: new Date().toISOString() })
    : await gate.supabase.from("venue_pro").delete().eq("venue_id", venueId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
