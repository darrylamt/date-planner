import { adminDataClient } from "@/lib/adminAuth";
import { ListingsReview, type Listing } from "@/components/admin/ListingsReview";

export const dynamic = "force-dynamic";

/*
 * Events read from ticketing sites (0118; scripts/scrape-tickets.ts), waiting
 * for the events team: soonest first, only those still to come.
 */
export default async function AdminListingsPage() {
  const db = await adminDataClient(["events"]);
  const [{ data, error }, { data: venues }, { data: areas }] = await Promise.all([
    db
      .from("ticket_listings")
      .select("id, source, url, title, starts_at, place_name, place_address, organiser, price_ghs, sold_out, image_url, description, suggested_venue_id")
      .eq("status", "new")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(150),
    db.from("venues").select("id, name, area_id").eq("is_active", true).neq("type", "stay").order("name").range(0, 4999),
    db.from("areas").select("id, name").range(0, 1999),
  ]);

  return (
    <div className="max-w-[860px]">
      <h1 className="font-display text-[24px] font-bold">Event listings</h1>
      <p className="mt-1 text-[14px] text-mutedbrown">
        Events read each morning from Aya Tickets and passa. Check each one, choose its venue, and approve it to put it
        on Duro!, booked on the ticketing site. Nothing goes live until it&apos;s approved.
      </p>
      {error ? (
        <p className="mt-6 text-mutedbrown">This needs migration 0118.</p>
      ) : (
        <ListingsReview
          listings={(data ?? []) as Listing[]}
          venues={(venues ?? []) as { id: string; name: string; area_id: string }[]}
          areaNames={Object.fromEntries(((areas ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))}
        />
      )}
    </div>
  );
}
