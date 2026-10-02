import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { chosenVenue, requirePortalUser } from "@/lib/venueAuth";
import { VenueNav } from "@/components/venue/VenueNav";
import { ListingEditor, type ListingRow } from "@/components/venue/ListingEditor";
import { PlannerLogo } from "@/components/venue/PlannerLogo";

export const dynamic = "force-dynamic";

/**
 * A venue's listing, and for a planner, their own details first.
 *
 * On the portal-wide gate rather than the venue one, for the same reason as
 * What's on: a planner with no location yet still has a logo to add, and the
 * venue gate bounced them back to Locations, which read as Details not working.
 */
export default async function VenueListingPage({
  searchParams,
}: {
  searchParams: { venue?: string };
}) {
  const session = await requirePortalUser();
  const planner = session.planner;
  const venue = session.venues.length ? chosenVenue(session, searchParams.venue) : null;
  const supabase = createClient();

  /*
   * Named columns, not "*". Since migration 0014 the venue grant has been an
   * explicit list and Postgres refuses SELECT * outright when any one column
   * is ungranted, rather than returning the rest.
   */
  const { data } = venue
    ? await supabase
        .from("venues")
        .select(
          "id, name, description, phone, whatsapp_phone, booking_url, instagram_handle, image_url, gallery_urls, cuisines, dress_code, reservation_required, is_active, vibe_tags, min_party_size, max_party_size"
        )
        .eq("id", venue.id)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <Suspense>
        <VenueNav venues={session.venues} currentVenueId={venue?.id ?? ""} planner={planner} />
      </Suspense>

      <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
        <h1 className="font-display text-[24px] font-bold">{planner ? "Details" : "Your listing"}</h1>
        <p className="mb-6 mt-1 text-[14px] text-mutedbrown">
          {planner
            ? "You, as people see you on your event cards, and the places you hold nights at."
            : `What people see when ${venue?.name ?? "your venue"} turns up in somebody's evening.`}
        </p>

        {planner ? <PlannerLogo name={planner.displayName} logoUrl={planner.logoUrl} /> : null}

        {venue && data ? (
          <>
            {planner ? <h2 className="mb-3 mt-8 font-display text-[18px] font-bold">{venue.name}</h2> : null}
            <ListingEditor row={data as unknown as ListingRow} />
          </>
        ) : venue ? (
          <p className="text-[14px] text-mutedbrown">We could not load this venue.</p>
        ) : (
          <div className="card mt-6 p-5 text-[14px]">
            <div className="font-semibold">No location yet</div>
            <p className="mt-1 text-mutedbrown">The details of the place go here once you have added one.</p>
            <Link href="/venue/locations?first=1" className="btn btnsm mt-3 inline-block">
              Add a location
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
