import { createClient } from "@/lib/supabase/server";
import { venuePortal } from "@/lib/venuePortal";
import { VenueShell } from "@/components/venue/VenueShell";
import { WeekHours } from "@/components/venue/WeekHours";

export default async function VenueHoursPage({ searchParams }: { searchParams: { venue?: string } }) {
  const { session, venue, imageUrl } = await venuePortal(searchParams.venue);
  const { data } = await createClient().from("venues").select("opening_periods").eq("id", venue.id).maybeSingle();

  return (
    <VenueShell venues={session.venues} current={venue} imageUrl={imageUrl} back={{ href: "/venue/listing", label: "Your place" }}>
      <div className="pl-up mb-5">
        <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">Opening hours</h1>
        <p className="mt-1 text-[15px] text-[var(--p-muted)]">We never send somebody to a locked door, so these decide when you can be in a plan.</p>
      </div>
      <WeekHours venueId={venue.id} raw={(data as { opening_periods?: unknown } | null)?.opening_periods} />
    </VenueShell>
  );
}
