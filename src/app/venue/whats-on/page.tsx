import { createClient } from "@/lib/supabase/server";
import { venuePortal } from "@/lib/venuePortal";
import { VenueShell } from "@/components/venue/VenueShell";
import { NightsManager } from "@/components/venue/NightsManager";
import type { EventRow, VenueSchedule } from "@/lib/types";

/** What's on: the venue's weekly nights and its dated events. */
export default async function VenueWhatsOnPage({ searchParams }: { searchParams: { venue?: string } }) {
  const { session, venue, imageUrl } = await venuePortal(searchParams.venue);
  const supabase = createClient();

  const [{ data: me }, { data: schedules }, { data: events }] = await Promise.all([
    supabase.from("venues").select("area_id").eq("id", venue.id).maybeSingle(),
    supabase.from("venue_schedules").select("*").eq("venue_id", venue.id).eq("is_active", true).order("weekday"),
    supabase.from("events").select("*").eq("venue_id", venue.id).eq("is_active", true).order("event_date"),
  ]);

  return (
    <VenueShell venues={session.venues} current={venue} imageUrl={imageUrl}>
      <NightsManager
        venueId={venue.id}
        areaId={(me as { area_id?: string } | null)?.area_id ?? ""}
        schedules={(schedules ?? []) as VenueSchedule[]}
        events={(events ?? []) as EventRow[]}
      />
    </VenueShell>
  );
}
