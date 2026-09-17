import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { chosenVenue, requireVenueUser } from "@/lib/venueAuth";
import { VenueNav } from "@/components/venue/VenueNav";
import { ReservationsInbox } from "@/components/venue/ReservationsInbox";
import type { ReservationRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * What a venue sees first: who is coming, and what we are missing about them.
 *
 * The bookings are the reason to open this twice. The gaps are the reason it
 * exists at all, and they are second rather than first because a portal that
 * greets you with homework is a portal you close.
 */
export default async function VenueDashboard({
  searchParams,
}: {
  searchParams: { venue?: string };
}) {
  const session = await requireVenueUser();
  const venue = chosenVenue(session, searchParams.venue);
  const supabase = createClient();

  /*
   * Read on the venue's own session, so RLS decides what comes back rather
   * than this file remembering to filter. A bug here returns nothing; it
   * cannot return somebody else's bookings.
   */
  const [{ data: bookings }, { data: row }] = await Promise.all([
    supabase
      .from("reservation_requests")
      .select("*")
      .eq("venue_id", venue.id)
      .order("reservation_date", { ascending: false })
      .limit(50),
    supabase
      .from("venues")
      .select(
        "image_url, gallery_urls, description, cuisines, opening_periods, phone, whatsapp_phone, instagram_handle, is_active"
      )
      .eq("id", venue.id)
      .maybeSingle(),
  ]);

  const v = (row ?? {}) as Record<string, unknown>;

  /*
   * Named one at a time rather than counted, because "your listing is 60%
   * complete" tells somebody nothing they can act on. Each line is a thing to
   * go and do, linked to the screen that does it.
   */
  const gaps: { label: string; href: string }[] = [];
  if (!v.image_url) gaps.push({ label: "No pictures yet", href: "/venue/listing" });
  if (!String(v.description ?? "").trim())
    gaps.push({ label: "No description", href: "/venue/listing" });
  if (!(v.cuisines as string[] | null)?.length)
    gaps.push({ label: "No kind of food recorded", href: "/venue/listing" });
  if (!v.opening_periods) gaps.push({ label: "No opening hours", href: "/venue/hours" });
  if (!v.phone) gaps.push({ label: "No phone number", href: "/venue/listing" });
  if (!v.whatsapp_phone)
    gaps.push({ label: "No WhatsApp number for bookings", href: "/venue/listing" });
  if (!v.instagram_handle) gaps.push({ label: "No Instagram", href: "/venue/listing" });

  const rows = (bookings ?? []) as ReservationRequest[];
  const waiting = rows.filter((b) => b.status === "requested" || b.status === "sent");

  return (
    <>
      <Suspense>
        <VenueNav venues={session.venues} currentVenueId={venue.id} />
      </Suspense>

      <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="font-display text-[24px] font-bold">{venue.name}</h1>
            <div className="text-[14px] text-mutedbrown">
              {venue.area ? `${venue.area} · ` : ""}
              {v.is_active === false
                ? "Currently hidden from plans"
                : "Showing in plans"}
            </div>
          </div>
          {waiting.length > 0 ? (
            <div className="rounded-bar bg-flame px-3 py-1.5 text-[14px] font-bold text-blush">
              {waiting.length} waiting on you
            </div>
          ) : null}
        </div>

        {gaps.length > 0 ? (
          <div className="card mt-5 p-5">
            <div className="text-[15px] font-bold">
              {gaps.length} thing{gaps.length === 1 ? "" : "s"} missing from your listing
            </div>
            <p className="mt-1 text-[14px] text-mutedbrown">
              Each one is a reason somebody planning an evening does not see you. Pictures matter
              most: nobody picks a place they cannot look at.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {gaps.map((g) => (
                <Link
                  key={g.label}
                  href={`${g.href}?venue=${venue.id}`}
                  className="rounded-full border border-line px-3 py-1 text-[13px] font-semibold text-cocoa transition-colors hover:border-flame hover:text-flame"
                >
                  {g.label} →
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="card mt-5 p-5 text-[14px] text-mutedbrown">
            Your listing is complete. Keep the menu and hours current and you will keep showing up
            in plans.
          </div>
        )}

        <h2 className="mt-8 font-display text-[19px] font-bold">Bookings</h2>
        <p className="mt-1 text-[14px] text-mutedbrown">
          People who asked for a table at your place through aduro. Marking one confirmed is only
          for your own record, it does not message them.
        </p>

        <div className="mt-4">
          <ReservationsInbox rows={rows} />
        </div>
      </main>
    </>
  );
}
