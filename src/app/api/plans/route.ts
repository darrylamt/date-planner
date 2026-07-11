import { NextResponse } from "next/server";
import { z } from "zod";
import { itinerarySchema, planInputsSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { randomSlug } from "@/lib/format";

const saveBodySchema = z.object({
  inputs: planInputsSchema,
  itinerary: itinerarySchema,
});

/** Save a plan for the signed-in user; returns the share slug. */
export async function POST(req: Request) {
  let body: z.infer<typeof saveBodySchema>;
  try {
    body = saveBodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid plan payload." }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("plans")
    .insert({
      user_id: user.id,
      share_slug: randomSlug(),
      inputs: body.inputs,
      itinerary: body.itinerary,
      total_budget_ghs: body.inputs.budget,
      estimated_total_ghs: body.itinerary.est_total_ghs,
    })
    .select("id, share_slug")
    .single();

  if (error) {
    console.error("plan save failed", error);
    return NextResponse.json({ error: "Could not save the plan." }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, share_slug: data.share_slug });
}
