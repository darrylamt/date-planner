import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Public venue detail: contact info + full menu (both are public-read tables). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: venue } = await supabase
    .from("venues")
    .select("id, name, phone, instagram_handle, reservation_required, menu_shared_from")
    .eq("id", params.id)
    .maybeSingle();

  if (!venue) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  /*
   * Read the menu through the share, the way the planner does.
   *
   * This queried menu_items by the requested id alone, so every branch priced
   * from another venue's menu answered with an empty list: the planner would
   * put a Honeysuckle or Flicks & Licks branch in an evening, correctly priced
   * off the owner's menu, and tapping the stop to see what they serve showed
   * nothing at all. Eight rows in the catalogue are branches, so this is most
   * of two chains.
   */
  const menuOwner = (venue as { menu_shared_from?: string | null }).menu_shared_from || venue.id;

  const { data: menu } = await supabase
    .from("menu_items")
    // The activity rules too, so the sheet can say "needs 6 players" and
    // "bring socks" rather than only a name and a price.
    .select(
      "id, venue_id, name, category, price_ghs, notes, covers_people, " +
        "min_players, max_players, duration_minutes, min_age, requires_gear"
    )
    .eq("venue_id", menuOwner)
    .order("category")
    .order("name");

  /*
   * Re-addressed to the branch that will serve them, not re-pointed, matching
   * what matching.ts does for the planner: the sheet is about this branch, and
   * an item still carrying the owner's venue_id invites the caller to think
   * the stop belongs to another venue.
   */
  // Cast because the select list is concatenated rather than a literal, which
  // leaves supabase-js unable to infer the row shape.
  const rows = (menu ?? []) as unknown as { id: string; venue_id: string }[];
  const items =
    menuOwner === venue.id
      ? rows
      : rows.map((m) => ({ ...m, id: `${venue.id}:${m.id}`, venue_id: venue.id }));

  return NextResponse.json({ venue, menu: items });
}
