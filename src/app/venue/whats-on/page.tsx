import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { chosenVenue, requireVenueUser } from "@/lib/venueAuth";
import { VenueNav } from "@/components/venue/VenueNav";
import { WhatsOnEditor } from "@/components/venue/WhatsOnEditor";
import type { EventRow, VenueSchedule } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function VenueWhatsOnPage({
  searchParams,
}: {
  searchParams: { venue?: string };
}) {
  const session = await requireVenueUser();
  const venue = chosenVenue(session, searchParams.venue);
  const supabase = createClient();

  const [{ data: me }, { data: schedules }, { data: events }] = await Promise.all([
    supabase.from("venues").select("area_id").eq("id", venue.id).maybeSingle(),
    supabase
      .from("venue_schedules")
      .select("*")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("weekday"),
    supabase
      .from("events")
      .select("*")
      .eq("venue_id", venue.id)
      .eq("is_active", true)
      .order("event_date"),
  ]);

  const areaId = (me as { area_id?: string } | null)?.area_id ?? "";

  return (
    <>
      <Suspense>
        <VenueNav venues={session.venues} currentVenueId={venue.id} planner={session.planner} />
      </Suspense>

      <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
        <h1 className="font-display text-[24px] font-bold">What&apos;s on</h1>
        <p className="mb-6 mt-1 text-[14px] text-mutedbrown">
          The reason somebody picks you over the place next door. We build evenings around this.
        </p>

        <WhatsOnEditor
          venueId={venue.id}
          areaId={areaId}
          schedules={(schedules ?? []) as VenueSchedule[]}
          events={(events ?? []) as EventRow[]}
        />
      </main>
    </>
  );
}
