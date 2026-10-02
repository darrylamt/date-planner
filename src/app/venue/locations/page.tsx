import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePortalUser } from "@/lib/venueAuth";
import { VenueNav } from "@/components/venue/VenueNav";
import { LocationsEditor } from "@/components/venue/LocationsEditor";

export const dynamic = "force-dynamic";

/**
 * The planner's own page, and the only one that works on an empty account.
 *
 * Uses requirePortalUser rather than requireVenueUser: the ordinary gate
 * sends a planner with no locations here, so this page asking for it would
 * redirect to itself.
 */
export default async function VenueLocationsPage({
  searchParams,
}: {
  searchParams: { first?: string };
}) {
  const session = await requirePortalUser();

  /*
   * A venue's own account has no business here. It runs a place that already
   * exists and cannot create another, so the page would offer a form that
   * migration 0046's policy refuses on save.
   */
  if (!session.planner) redirect("/venue");

  const supabase = createClient();
  const { data: areas } = await supabase.from("areas").select("id, name").order("name");

  return (
    <>
      <Suspense>
        <VenueNav
          venues={session.venues}
          currentVenueId={session.venues[0]?.id ?? ""}
          planner={session.planner}
        />
      </Suspense>

      <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
        <h1 className="font-display text-[24px] font-bold">
          {session.venues.length ? "Locations" : "Add a place"}
        </h1>
        <p className="mb-6 mt-1 text-[14px] text-mutedbrown">
          {session.venues.length
            ? "Places you added that were not on Duro yet. Your nights can also be at any venue we list, chosen on What's on."
            : "Most nights can go at a venue Duro already lists, chosen on What's on. Add a place here only if it is not on Duro yet."}
        </p>

        <LocationsEditor
          areas={(areas ?? []) as { id: string; name: string }[]}
          locations={session.venues}
          isFirst={searchParams.first === "1"}
        />
      </main>
    </>
  );
}
