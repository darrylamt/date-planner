import { createClient } from "@/lib/supabase/server";
import { venuePortal } from "@/lib/venuePortal";
import { fetchAllRows } from "@/lib/fetchAll";
import { VenueShell } from "@/components/venue/VenueShell";
import { MenuManager, type MenuScope } from "@/components/venue/MenuManager";
import type { MenuItem } from "@/lib/types";

export default async function VenueMenuPage({ searchParams }: { searchParams: { venue?: string } }) {
  const { session, venue, imageUrl } = await venuePortal(searchParams.venue);
  const supabase = createClient();

  const { data: me } = await supabase.from("venues").select("menu_shared_from").eq("id", venue.id).maybeSingle();
  const ownerId = (me as { menu_shared_from?: string | null } | null)?.menu_shared_from || venue.id;

  // Who else eats off this list, so the screen can say "all 5 branches" and mean it.
  const { count: sharers } = await supabase.from("venues").select("id", { count: "exact", head: true }).eq("menu_shared_from", ownerId);

  // Both lists, paged: PostgREST stops at a thousand rows without saying so.
  const ids = [...new Set([ownerId, venue.id])];
  const items = await fetchAllRows<MenuItem>((from, to) => supabase.from("menu_items").select("*").in("venue_id", ids).range(from, to));

  const scope: MenuScope = { venueId: venue.id, venueName: venue.name, ownerId, branchCount: (sharers ?? 0) + 1 };

  return (
    <VenueShell venues={session.venues} current={venue} imageUrl={imageUrl}>
      <a
        href={session.venues.length > 1 ? `/venue/menu/style?venue=${venue.id}` : "/venue/menu/style"}
        className="pl-card mb-5 flex items-center justify-between gap-3 p-4 hover:bg-[var(--p-sunken)]"
      >
        <span>
          <span className="block text-[16px] font-bold">Menu page look</span>
          <span className="block text-[14px] text-[var(--p-muted)]">Your logo, cover photo, colours and fonts on the menu page your QR stickers open.</span>
        </span>
        <span aria-hidden="true" className="text-[22px] font-bold">›</span>
      </a>
      <MenuManager scope={scope} items={items} />
    </VenueShell>
  );
}
