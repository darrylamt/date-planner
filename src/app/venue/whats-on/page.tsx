import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { chosenVenue, requirePortalUser } from "@/lib/venueAuth";
import { VenueNav } from "@/components/venue/VenueNav";
import { WhatsOnEditor } from "@/components/venue/WhatsOnEditor";
import type { EventRow, VenueSchedule } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * What's on: the weekly nights and the dated events.
 *
 * Where a planner lands, so it has to work for one with nothing yet. It used
 * the ordinary gate, which sends an account with no location to Locations,
 * and a planner tapping What's on on their first day found the tab bounced
 * them back to the form they had just left, which read as the tab not
 * working. Now they stay here and are shown the first steps, in order.
 */
export default async function VenueWhatsOnPage({
  searchParams,
}: {
  searchParams: { venue?: string };
}) {
  const session = await requirePortalUser();
  const planner = session.planner;

  if (!session.venues.length) {
    return (
      <>
        <Suspense>
          <VenueNav venues={session.venues} currentVenueId="" planner={planner} />
        </Suspense>
        <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
          <h1 className="font-display text-[24px] font-bold">Welcome{planner ? `, ${planner.displayName}` : ""}</h1>
          <p className="mb-6 mt-1 text-[14px] text-mutedbrown">
            Three steps and your nights start showing up in people&apos;s plans.
          </p>
          <FirstSteps hasLocation={false} hasEvent={false} hasLogo={Boolean(planner?.logoUrl)} />
        </main>
      </>
    );
  }

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
  const rows = (events ?? []) as EventRow[];
  const setUp = Boolean(planner?.logoUrl) && rows.length > 0;

  return (
    <>
      <Suspense>
        <VenueNav venues={session.venues} currentVenueId={venue.id} planner={planner} />
      </Suspense>

      <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
        <h1 className="font-display text-[24px] font-bold">What&apos;s on</h1>
        <p className="mb-6 mt-1 text-[14px] text-mutedbrown">
          {planner
            ? `Your nights at ${venue.name}. Each one can lead an evening somebody plans.`
            : "The reason somebody picks you over the place next door. We build evenings around this."}
        </p>

        {planner && !setUp ? (
          <div className="mb-6">
            <FirstSteps hasLocation hasEvent={rows.length > 0} hasLogo={Boolean(planner.logoUrl)} />
          </div>
        ) : null}

        <WhatsOnEditor
          venueId={venue.id}
          areaId={areaId}
          schedules={(schedules ?? []) as VenueSchedule[]}
          events={rows}
          organiser={planner ? { name: planner.displayName, logoUrl: planner.logoUrl } : null}
        />
      </main>
    </>
  );
}

/** A planner's way in, as three things to do, each ticked off when done. */
function FirstSteps({ hasLocation, hasEvent, hasLogo }: { hasLocation: boolean; hasEvent: boolean; hasLogo: boolean }) {
  const steps = [
    {
      done: hasLocation,
      title: "Add where it happens",
      body: "The place your nights are held. It decides which plans they can appear in.",
      href: "/venue/locations?first=1",
      cta: "Add a location",
    },
    {
      done: hasEvent,
      title: "Put your first night on",
      body: "Date, time, what it costs at the door, and a poster if you have one.",
      href: hasLocation ? "#add-event" : null,
      cta: "Add it below",
    },
    {
      done: hasLogo,
      title: "Add your logo",
      body: "It goes on your event's card in every plan it appears in.",
      href: "/venue/listing",
      cta: "Add your logo",
    },
  ];
  return (
    <div className="card p-5">
      <div className="text-[15px] font-bold">Getting started</div>
      <ol className="mt-3 grid gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                s.done ? "bg-flame text-blush" : "bg-cream text-mutedbrown ring-1 ring-black/10"
              }`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-[14px] font-semibold ${s.done ? "text-mutedbrown line-through" : ""}`}>{s.title}</div>
              <div className="text-[13px] text-mutedbrown">{s.body}</div>
            </div>
            {!s.done && s.href ? (
              s.href.startsWith("#") ? (
                <a href={s.href} className="btn2 btnsm shrink-0">
                  {s.cta}
                </a>
              ) : (
                <Link href={s.href} className="btn btnsm shrink-0">
                  {s.cta}
                </Link>
              )
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
