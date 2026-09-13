import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Approve or reject a proposed phone number.
 *
 * The only path by which a number becomes dialable. Everything else, CSV
 * import, the ingest tool, an admin edit, the verifier, can only ever write
 * `phone_pending`, because the reservation flow hands a user to this number
 * over WhatsApp with a message signed "sent via aduro". A hijacked listing
 * that propagates automatically would be fraud committed under our name.
 */
const bodySchema = z.object({
  venueId: z.string().uuid(),
  action: z.enum(["approve", "reject", "clear"]),
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

  const { data: venue, error: readError } = await supabase
    .from("venues")
    .select("id, phone, phone_pending")
    .eq("id", body.venueId)
    .maybeSingle();

  /*
   * A failed read and a missing row are different problems and used to give
   * the same answer. This route spent a while reporting "Venue not found" for
   * every approval while the real cause was a permission error on
   * phone_pending, and swallowing the error is what hid it.
   */
  if (readError) {
    console.error("phone read failed", readError);
    return NextResponse.json({ error: "Could not read the venue." }, { status: 500 });
  }
  if (!venue) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  if (body.action === "approve") {
    if (!venue.phone_pending) {
      return NextResponse.json({ error: "Nothing pending to approve." }, { status: 400 });
    }
    const { data: updated, error } = await supabase
      .from("venues")
      .update({
        phone: venue.phone_pending,
        phone_pending: null,
        phone_status: "approved",
        phone_approved_at: new Date().toISOString(),
        phone_approved_by: userId,
        // A fresh approval clears prior reports; the number just changed.
        phone_reported_at: null,
        phone_report_count: 0,
      })
      .eq("id", body.venueId)
      .select("id");

    if (error) {
      console.error("phone approve failed", error);
      return NextResponse.json({ error: "Could not approve." }, { status: 500 });
    }
    /*
     * An update that matched nothing is not a success, and without the select
     * above it was indistinguishable from one: PostgREST answers 204 either
     * way, so a write blocked at the database returned ok and the screen
     * painted a green "Approved" over a number that never went live. On the
     * one field where being wrong is fraud under our name, saying "done" on
     * no evidence is the wrong default.
     */
    if (!updated?.length) {
      return NextResponse.json(
        { error: "Nothing was written. Reload and try again." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reject") {
    // Keep the rejected number rather than deleting it, so the same bad number
    // arriving again is visible as a re-proposal rather than looking new.
    const { data: updated, error } = await supabase
      .from("venues")
      .update({ phone_pending: null, phone_status: "rejected" })
      .eq("id", body.venueId)
      .select("id");

    if (error) return NextResponse.json({ error: "Could not reject." }, { status: 500 });
    if (!updated?.length) {
      return NextResponse.json(
        { error: "Nothing was written. Reload and try again." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  // "clear" pulls a live number immediately, used when a report comes in and
  // nobody has checked it yet. Costs us a booking; the alternative costs
  // someone their money.
  const { data: updated, error } = await supabase
    .from("venues")
    .update({
      phone: null,
      phone_pending: venue.phone,
      phone_status: "pending",
      phone_source: "withdrawn after report, needs re-checking",
      phone_approved_at: null,
      phone_approved_by: null,
    })
    .eq("id", body.venueId)
    .select("id");

  if (error) return NextResponse.json({ error: "Could not withdraw." }, { status: 500 });
  // Withdrawal is the safety valve, so a silent no-op here is the worst of the
  // three: the number stays dialable while the screen says it is gone.
  if (!updated?.length) {
    return NextResponse.json(
      { error: "Nothing was written. The number may still be live, reload and check." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
