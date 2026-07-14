import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Public venue detail: contact info + full menu (both are public-read tables). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: venue }, { data: menu }] = await Promise.all([
    supabase
      .from("venues")
      .select("id, name, phone, instagram_handle, reservation_required")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("menu_items")
      .select("id, venue_id, name, category, price_ghs, notes")
      .eq("venue_id", params.id)
      .order("category")
      .order("name"),
  ]);

  if (!venue) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  return NextResponse.json({ venue, menu: menu ?? [] });
}
