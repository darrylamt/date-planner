import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { chosenVenue, requireVenueUser } from "@/lib/venueAuth";
import { VenueNav } from "@/components/venue/VenueNav";
import { HoursForm } from "@/components/venue/HoursForm";

export const dynamic = "force-dynamic";

export default async function VenueHoursPage({
  searchParams,
}: {
  searchParams: { venue?: string };
}) {
  const session = await requireVenueUser();
  const venue = chosenVenue(session, searchParams.venue);
  const supabase = createClient();

  const { data } = await supabase
    .from("venues")
    .select("id, opening_periods")
    .eq("id", venue.id)
    .maybeSingle();

  return (
    <>
      <Suspense>
        <VenueNav venues={session.venues} currentVenueId={venue.id} planner={session.planner} />
      </Suspense>

      <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
        <h1 className="font-display text-[24px] font-bold">Hours</h1>
        <p className="mb-6 mt-1 text-[14px] text-mutedbrown">
          We never put somebody in front of a locked door. If we do not know your hours we have to
          guess, and a plan built on a guess is one you have to turn away.
        </p>

        <HoursForm venueId={venue.id} raw={(data as { opening_periods?: unknown })?.opening_periods} />
      </main>
    </>
  );
}
