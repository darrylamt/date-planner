import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { chosenVenue, requireVenueUser } from "@/lib/venueAuth";
import { VenueNav } from "@/components/venue/VenueNav";
import { MenuEditor, type MenuScope } from "@/components/venue/MenuEditor";
import { fetchAllRows } from "@/lib/fetchAll";
import type { MenuItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function VenueMenuPage({
  searchParams,
}: {
  searchParams: { venue?: string };
}) {
  const session = await requireVenueUser();
  const venue = chosenVenue(session, searchParams.venue);
  const supabase = createClient();

  const { data: me } = await supabase
    .from("venues")
    .select("id, name, menu_shared_from")
    .eq("id", venue.id)
    .maybeSingle();

  const ownerId = (me as { menu_shared_from?: string | null } | null)?.menu_shared_from || venue.id;

  /*
   * Who else eats off this list, so the screen can say "all 5 branches" rather
   * than "all branches" and mean it. Counts the owner plus everybody pointing
   * at it; one means nobody shares, and the branch question is never asked.
   */
  const [{ data: owner }, { count: sharers }] = await Promise.all([
    supabase.from("venues").select("id, name").eq("id", ownerId).maybeSingle(),
    supabase
      .from("venues")
      .select("id", { count: "exact", head: true })
      .eq("menu_shared_from", ownerId),
  ]);

  /*
   * Both lists, paged. The Honeysuckle is 182 items and Casa1715 is 311, and
   * PostgREST caps a request at a thousand rows without saying so.
   */
  const ids = [...new Set([ownerId, venue.id])];
  const items = await fetchAllRows<MenuItem>((from, to) =>
    supabase.from("menu_items").select("*").in("venue_id", ids).range(from, to)
  );

  const scope: MenuScope = {
    venueId: venue.id,
    venueName: venue.name,
    ownerId,
    ownerName: (owner as { name?: string } | null)?.name ?? venue.name,
    branchCount: (sharers ?? 0) + 1,
  };

  return (
    <>
      <Suspense>
        <VenueNav venues={session.venues} currentVenueId={venue.id} />
      </Suspense>

      <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
        <h1 className="font-display text-[24px] font-bold">Menu</h1>
        <p className="mt-1 text-[14px] text-mutedbrown">
          Real dishes at real prices. This is what we build an evening out of, so a plan can
          promise somebody what they will actually pay.
        </p>

        {scope.branchCount > 1 ? (
          <p className="mt-2 text-[14px] text-mutedbrown">
            This menu is shared with {scope.branchCount - 1} other branch
            {scope.branchCount - 1 === 1 ? "" : "es"}. Anything you add goes everywhere unless you
            say it is only here.
          </p>
        ) : null}

        <div className="mt-6">
          <MenuEditor
            scope={scope}
            shared={items.filter((i) => i.venue_id === ownerId)}
            own={items.filter((i) => i.venue_id === venue.id && venue.id !== ownerId)}
          />
        </div>
      </main>
    </>
  );
}
