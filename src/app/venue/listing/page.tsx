import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { chosenVenue, requireVenueUser } from "@/lib/venueAuth";
import { VenueNav } from "@/components/venue/VenueNav";
import { ListingEditor, type ListingRow } from "@/components/venue/ListingEditor";

export const dynamic = "force-dynamic";

export default async function VenueListingPage({
  searchParams,
}: {
  searchParams: { venue?: string };
}) {
  const session = await requireVenueUser();
  const venue = chosenVenue(session, searchParams.venue);
  const supabase = createClient();

  /*
   * Named columns, not "*". Since migration 0014 the venue grant has been an
   * explicit list and Postgres refuses SELECT * outright when any one column
   * is ungranted, rather than returning the rest.
   */
  const { data } = await supabase
    .from("venues")
    .select(
      "id, name, description, phone, whatsapp_phone, instagram_handle, image_url, gallery_urls, cuisines, dress_code, reservation_required, is_active, vibe_tags, min_party_size, max_party_size"
    )
    .eq("id", venue.id)
    .maybeSingle();

  return (
    <>
      <Suspense>
        <VenueNav venues={session.venues} currentVenueId={venue.id} />
      </Suspense>

      <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
        <h1 className="font-display text-[24px] font-bold">Your listing</h1>
        <p className="mb-6 mt-1 text-[14px] text-mutedbrown">
          What people see when {venue.name} turns up in somebody&apos;s evening.
        </p>

        {data ? (
          <ListingEditor row={data as unknown as ListingRow} />
        ) : (
          <p className="text-[14px] text-mutedbrown">We could not load this venue.</p>
        )}
      </main>
    </>
  );
}
