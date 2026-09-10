import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Report something wrong with a venue.
 *
 * Public on purpose. Plans can be built signed-out, and the person who has
 * just found the price is different, or the door locked, is the one with the
 * information, asking them to make an account first would lose exactly the
 * report worth having.
 *
 * Nothing here edits the catalog. A report is a flag for a human to act on,
 * the same way a proposed phone number waits for approval: a venue that anyone
 * could silently repoint is a venue anyone could silently repoint at
 * themselves.
 */
export const maxDuration = 15;

const bodySchema = z.object({
  venueId: z.string().uuid(),
  reportType: z.enum(["price", "closed", "phone", "wrong_info", "other"]),
  /** Only meaningful for a price report; ignored otherwise. */
  suggestedPriceGhs: z.number().min(0).max(100000).nullable().optional(),
  note: z.string().max(600).optional(),
  /** Per-install id, so one person tapping twice is not two people agreeing. */
  deviceId: z.string().min(6).max(64).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("venue_reports").insert({
    venue_id: body.venueId,
    report_type: body.reportType,
    suggested_price_ghs:
      body.reportType === "price" ? (body.suggestedPriceGhs ?? null) : null,
    note: body.note?.trim() || null,
    reporter_id: user?.id ?? null,
    reporter_device: body.deviceId ?? null,
    status: "open",
  });

  if (error) {
    /*
     * 23505 is the one-open-report-per-device index doing its job. That is not
     * a failure worth showing anyone: they already told us, and saying so
     * plainly beats an error that invites them to try again.
     */
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("venue report insert failed", error);
    return NextResponse.json({ error: "Could not send that report." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, duplicate: false });
}
