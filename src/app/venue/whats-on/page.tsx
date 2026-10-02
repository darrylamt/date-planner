import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { chosenVenue, requirePortalUser } from "@/lib/venueAuth";
import { VenueNav } from "@/components/venue/VenueNav";
import { WhatsOnEditor, type EventPlace } from "@/components/venue/WhatsOnEditor";
import type { EventRow, VenueSchedule } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * What's on: the weekly nights and the dated events.
 *
 * Where a planner lands, so it works for one with nothing yet. It used the
 * ordinary gate, which sends an account with no location to Locations, and a
 * planner tapping What's on on their first day found the tab bounced them
 * back, which read as the tab not working.
 *
 * A planner's nights are not tied to one place (0072): the same night moves
 * between clubs, so each event says where it is, chosen from their own places
 * and every venue on Duro, and this page lists all of theirs wherever they
 * are. A venue's page is as it was: its own place, its own nights.
 */
export default async function VenueWhatsOnPage({
  searchParams,
}: {
  searchParams: { venue?: string };
}) {
  const session = await requirePortalUser();
  const planner = session.planner;
  const supabase = createClient();
  const venue = session.venues.length ? chosenVenue(session, searchParams.venue) : null;
  const mine = session.venues.map((v) => v.id);

  // A venue: its own events. A planner: every event they made, and any at their own places.
  async function plannerEvents(): Promise<EventRow[]> {
    const filter = mine.length ? `created_by.eq.${session.userId},venue_id.in.(${mine.join(",")})` : `created_by.eq.${session.userId}`;
    const first = await supabase.from("events").select("*").eq("is_active", true).or(filter).order("event_date");
    if (!first.error) return (first.data ?? []) as EventRow[];
    // Before 0072 there is no created_by: fall back to the events at their own places.
    if (!mine.length) return [];
    const { data } = await supabase.from("events").select("*").eq("is_active", true).in("venue_id", mine).order("event_date");
    return (data ?? []) as EventRow[];
  }

  const [{ data: me }, { data: schedules }, events, { data: venueRows }] = await Promise.all([
    venue ? supabase.from("venues").select("area_id").eq("id", venue.id).maybeSingle() : Promise.resolve({ data: null }),
    venue
      ? supabase.from("venue_schedules").select("*").eq("venue_id", venue.id).eq("is_active", true).order("weekday")
      : Promise.resolve({ data: [] }),
    planner
      ? plannerEvents()
      : supabase
          .from("events")
          .select("*")
          .eq("venue_id", venue!.id)
          .eq("is_active", true)
          .order("event_date")
          .then((r) => (r.data ?? []) as EventRow[]),
    planner
      ? supabase.from("venues").select("id, name, area_id, areas(name)").eq("is_active", true).order("name")
      : Promise.resolve({ data: null }),
  ]);

  const areaId = (me as { area_id?: string } | null)?.area_id ?? "";
  const places: EventPlace[] | null = planner
    ? ((venueRows ?? []) as unknown as { id: string; name: string; area_id: string; areas: { name: string } | null }[])
        .map((v) => ({ id: v.id, name: v.name, area_id: v.area_id, area: v.areas?.name ?? "", mine: mine.includes(v.id) }))
        .sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name))
    : null;
  const setUp = Boolean(planner?.logoUrl) && events.length > 0;

  return (
    <>
      <Suspense>
        <VenueNav venues={session.venues} currentVenueId={venue?.id ?? ""} planner={planner} />
      </Suspense>

      <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
        <h1 className="font-display text-[24px] font-bold">
          {planner && !events.length ? `Welcome, ${planner.displayName}` : "What's on"}
        </h1>
        <p className="mb-6 mt-1 text-[14px] text-mutedbrown">
          {planner
            ? "Your nights, wherever they are. Each one can lead an evening somebody plans."
            : "The reason somebody picks you over the place next door. We build evenings around this."}
        </p>

        {planner && !setUp ? (
          <div className="mb-6">
            <FirstSteps hasEvent={events.length > 0} hasLogo={Boolean(planner.logoUrl)} />
          </div>
        ) : null}

        <WhatsOnEditor
          venueId={venue?.id ?? ""}
          areaId={areaId}
          schedules={(schedules ?? []) as VenueSchedule[]}
          events={events}
          organiser={planner ? { name: planner.displayName, logoUrl: planner.logoUrl } : null}
          places={places}
        />
      </main>
    </>
  );
}

/** A planner's way in, as things to do, each ticked off when done. */
function FirstSteps({ hasEvent, hasLogo }: { hasEvent: boolean; hasLogo: boolean }) {
  const steps = [
    {
      done: hasEvent,
      title: "Put your first night on",
      body: "Pick the venue from the list below, any place on Duro, and the date, time and price at the door. Somewhere we do not list yet? Add it under Locations.",
      href: "#add-event",
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
            {!s.done ? (
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
