import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Close out a problem report.
 *
 * One report at a time, unlike its venue sibling. There, five people saying a
 * place has shut is one decision; here every report is a sentence somebody
 * wrote, and two reports about chat can easily be two different bugs. Batching
 * them would close the one nobody read.
 */
const bodySchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["actioned", "dismissed", "reopen"]),
  resolution: z.string().max(600).optional(),
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

  const reopening = body.action === "reopen";

  /*
   * .select() and count the rows. PostgREST reports an UPDATE that matched
   * nothing as a success, so without this a wrong id returns "Done" and the
   * report stays in the queue.
   */
  const { data, error } = await supabase
    .from("issue_reports")
    .update({
      status: reopening ? "open" : body.action,
      reviewed_at: reopening ? null : new Date().toISOString(),
      reviewed_by: reopening ? null : userId,
      resolution: body.resolution?.trim() || null,
    })
    .eq("id", body.id)
    .select("id");

  if (error) {
    console.error("issue report update failed", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: "That report is gone." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    message: reopening
      ? "Back in the queue."
      : body.action === "actioned"
        ? "Marked fixed."
        : "Dismissed.",
  });
}
