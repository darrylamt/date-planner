import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Act on the open reports for one venue.
 *
 * Actions resolve every open report on that venue at once, because they are
 * grouped that way when reviewed: five people saying the same thing is one
 * decision, and leaving four of them open afterwards would make the queue
 * look permanently busy.
 */
const bodySchema = z.object({
  venueId: z.string().uuid(),
  action: z.enum(["dismiss", "reviewed", "apply_price", "deactivate"]),
  value: z.number().min(0).max(100000).optional(),
});

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { supabase, userId } = gate;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let message = "Marked reviewed.";

  if (body.action === "apply_price") {
    if (body.value == null) {
      return NextResponse.json({ error: "No price given." }, { status: 400 });
    }
    const { error } = await supabase
      .from("venues")
      .update({ avg_cost_per_person_ghs: body.value })
      .eq("id", body.venueId);
    if (error) {
      console.error("apply reported price failed", error);
      return NextResponse.json({ error: "Could not set the price." }, { status: 500 });
    }
    message = `Price set to GHS ${body.value}.`;
  }

  if (body.action === "deactivate") {
    // Deactivated, never deleted. The menu and curation took work, and a place
    // that shut for Ramadan or a refit is not gone.
    const { error } = await supabase
      .from("venues")
      .update({
        is_active: false,
        verification_status: "closed",
        verification_summary: "Reported closed by people using plans.",
        verified_at: new Date().toISOString(),
      })
      .eq("id", body.venueId);
    if (error) {
      console.error("deactivate from report failed", error);
      return NextResponse.json({ error: "Could not deactivate." }, { status: 500 });
    }
    message = "Venue deactivated.";
  }

  if (body.action === "dismiss") message = "Dismissed.";

  const { error } = await supabase
    .from("venue_reports")
    .update({
      status: body.action === "dismiss" ? "dismissed" : "reviewed",
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq("venue_id", body.venueId)
    .eq("status", "open");

  if (error) {
    console.error("resolving reports failed", error);
    return NextResponse.json({ error: "Acted, but could not close the reports." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message });
}
