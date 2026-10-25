import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { PhotoQueue, type PhotoRow, type PosterRow } from "@/components/admin/PhotoQueue";

export const dynamic = "force-dynamic";

/**
 * Photos: the desk for the photos role (0095), and for admins.
 *
 * Venues with no cover first, then the ones with thin galleries, because a
 * stop card without a picture is the one people skip. Upcoming events with no
 * poster on a second tab.
 */
export default async function PhotosPage({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = await adminDataClient(["photos"]);
  const tab = searchParams.tab === "events" ? "events" : "venues";
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: venues }, { data: events }] = await Promise.all([
    supabase.from("venues").select("id, name, type, is_active, image_url, gallery_urls, areas(name)").eq("is_active", true).order("name"),
    supabase
      .from("events")
      .select("id, title, event_date, image_url, venues(name)")
      .eq("is_active", true)
      .gte("event_date", today)
      .order("event_date")
      .limit(300),
  ]);

  const rows: PhotoRow[] = ((venues ?? []) as any[]).map((v) => ({
    id: v.id,
    name: v.name,
    area: v.areas?.name ?? "",
    type: v.type,
    cover: v.image_url ?? null,
    gallery: Array.isArray(v.gallery_urls) ? v.gallery_urls.length : 0,
  }));
  const posters: PosterRow[] = ((events ?? []) as any[]).map((e) => ({
    id: e.id,
    title: e.title,
    date: e.event_date,
    venue: e.venues?.name ?? "",
    image: e.image_url ?? null,
  }));
  const noCover = rows.filter((r) => !r.cover).length;
  const thin = rows.filter((r) => r.cover && r.gallery < 3).length;
  const noPoster = posters.filter((p) => !p.image).length;

  return (
    <div>
      <h1>Photos</h1>
      <p className="max-w-[680px] text-[14px] text-mutedbrown">
        A cover and at least three more pictures for every venue, and a poster for every event. Real photos of the place,
        never a stock picture.
      </p>
      <div className="mt-5 flex gap-2">
        <Link href="/admin/photos" className={tab === "venues" ? "btn btnsm" : "btn2 btnsm"}>
          Venues · {noCover} without a cover, {thin} with under 3 more
        </Link>
        <Link href="/admin/photos?tab=events" className={tab === "events" ? "btn btnsm" : "btn2 btnsm"}>
          Event images · {noPoster} missing
        </Link>
      </div>
      <PhotoQueue tab={tab} venues={rows} events={posters} />
    </div>
  );
}
