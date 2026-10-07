import { venuePortal } from "@/lib/venuePortal";
import { VenueShell } from "@/components/venue/VenueShell";
import { VenueHelp } from "@/components/venue/VenueHelp";

/** Help: answers, a message to a person, the tour again, and sign out. */
export default async function VenueHelpPage({ searchParams }: { searchParams: { venue?: string } }) {
  const { session, venue, imageUrl } = await venuePortal(searchParams.venue);
  const many = session.venues.length > 1;
  return (
    <VenueShell venues={session.venues} current={venue} imageUrl={imageUrl}>
      <div className="pl-up mb-5">
        <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">Help</h1>
        <p className="mt-1 text-[15px] text-[var(--p-muted)]">Quick answers, or ask us directly.</p>
      </div>
      <VenueHelp who={venue.name} tourHref={many ? `/venue?venue=${venue.id}&tour=1` : "/venue?tour=1"} />
    </VenueShell>
  );
}
