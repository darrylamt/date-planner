import { createClient } from "@/lib/supabase/server";
import { venuePortal } from "@/lib/venuePortal";
import { describeDay, parsePeriods } from "@/lib/hours";
import { VenueShell } from "@/components/venue/VenueShell";
import { PlaceEditor, type PlaceRow } from "@/components/venue/PlaceEditor";

/** "Mon–Sat 12:00 to 22:00 · Sun closed", short enough for one line. */
function summarise(raw: unknown): string | null {
  const periods = parsePeriods(raw);
  if (!periods?.length) return null;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const runs: { from: number; to: number; text: string }[] = [];
  for (const d of order) {
    const text = describeDay(periods, d);
    const last = runs[runs.length - 1];
    if (last && last.text === text) last.to = d;
    else runs.push({ from: d, to: d, text });
  }
  return runs.map((r) => `${names[r.from]}${r.to !== r.from ? `–${names[r.to]}` : ""} ${r.text}`).join(" · ");
}

export default async function VenueListingPage({ searchParams }: { searchParams: { venue?: string } }) {
  const { session, venue, imageUrl } = await venuePortal(searchParams.venue);
  // Named columns: Postgres refuses SELECT * on venues when any column is ungranted (0014).
  const { data } = await createClient()
    .from("venues")
    .select(
      "id, name, description, phone, whatsapp_phone, booking_url, instagram_handle, image_url, gallery_urls, cuisines, dress_code, reservation_required, is_active, vibe_tags, min_party_size, max_party_size, opening_periods"
    )
    .eq("id", venue.id)
    .maybeSingle();
  const row = data as (PlaceRow & { opening_periods: unknown }) | null;
  const { opening_periods, ...place } = row ?? ({} as PlaceRow & { opening_periods: unknown });

  return (
    <VenueShell venues={session.venues} current={venue} imageUrl={imageUrl}>
      <div className="pl-up mb-5">
        <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">Your place</h1>
        <p className="mt-1 text-[15px] text-[var(--p-muted)]">What people see when {venue.name} turns up in their evening.</p>
      </div>
      {row ? (
        <PlaceEditor
          row={place as PlaceRow}
          hoursSummary={summarise(opening_periods)}
          hoursHref={session.venues.length > 1 ? `/venue/hours?venue=${venue.id}` : "/venue/hours"}
        />
      ) : (
        <div className="pl-card p-6 text-[15px] text-[var(--p-muted)]">We couldn&apos;t load your place. Refresh, or tell us under Help.</div>
      )}
    </VenueShell>
  );
}
