import { Suspense } from "react";
import { requirePortalUser } from "@/lib/venueAuth";
import { VenueNav } from "@/components/venue/VenueNav";
import { PortalHelp } from "@/components/venue/PortalHelp";

export const dynamic = "force-dynamic";

/**
 * Help, for venues and planners alike: a way to tell us something is wrong,
 * answers to what people ask most, and how to reach a person.
 *
 * Reports go into issue_reports like the app's own, tagged with who sent them
 * and what about, so they land on the admin's Issues page beside the rest.
 */
export default async function VenueHelpPage({ searchParams }: { searchParams: { venue?: string } }) {
  const session = await requirePortalUser();
  const who = session.planner?.displayName ?? session.venues[0]?.name ?? "portal";
  const currentVenueId =
    session.venues.find((v) => v.id === searchParams.venue)?.id ?? session.venues[0]?.id ?? "";

  return (
    <>
      <Suspense>
        <VenueNav venues={session.venues} currentVenueId={currentVenueId} planner={session.planner} />
      </Suspense>
      <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
        <h1 className="font-display text-[24px] font-bold">Help</h1>
        <p className="mb-6 mt-1 text-[14px] text-mutedbrown">
          Something not working, or not sure how? Tell us here and a person reads it.
        </p>
        <PortalHelp who={who} planner={Boolean(session.planner)} />
      </main>
    </>
  );
}
