import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { fetchAllRows } from "@/lib/fetchAll";
import { PhotoQueue, type PhotoRow, type PosterRow } from "@/components/admin/PhotoQueue";

export const dynamic = "force-dynamic";

/**
 * Photos: the desk for the photos role (0095), and for admins.
 *
 * Venues with no cover first, the ones in the most plans at the top (owner,
 * 9 Nov 2026: "show me which ones need pictures first"): a plan is
 * remembered by its reveal, and a grey box there is seen most where a venue
 * is planned most. Counted from plan_demand over 90 days, the team's own
 * plans left out. Then the ones with thin galleries. Upcoming events with no
 * poster on a second tab.
 */
export default async function PhotosPage({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = await adminDataClient(["photos"]);
  const tab = searchParams.tab === "events" ? "events" : "venues";
  const today = new Date().toISOString().slice(0, 10);

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [{ data: venues }, { data: events }, planned] = await Promise.all([
    supabase.from("venues").select("id, name, type, is_active, image_url, gallery_urls, areas(name)").eq("is_active", true).order("name"),
    supabase
      .from("events")
      .select("id, title, event_date, image_url, venues(name)")
      .eq("is_active", true)
      .gte("event_date", today)
      .order("event_date")
      .limit(300),
    fetchAllRows<{ venue_ids: string[] | null }>((a, b) =>
      supabase.from("plan_demand").select("venue_ids").eq("team", false).not("venue_ids", "is", null).gte("created_at", since).order("id").range(a, b)
    ),
  ]);
  const inPlans = new Map<string, number>();
  for (const r of planned) for (const id of new Set(r.venue_ids ?? [])) inPlans.set(id, (inPlans.get(id) ?? 0) + 1);

  const rows: PhotoRow[] = ((venues ?? []) as any[]).map((v) => ({
    id: v.id,
    name: v.name,
    area: v.areas?.name ?? "",
    type: v.type,
    cover: v.image_url ?? null,
    gallery: Array.isArray(v.gallery_urls) ? v.gallery_urls.length : 0,
    plans: inPlans.get(v.id) ?? 0,
    first: false,
  }));
  // The fifty to do first: no cover, most planned.
  for (const r of rows.filter((r) => !r.cover && r.plans > 0).sort((a, b) => b.plans - a.plans).slice(0, 50)) r.first = true;
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
        never a stock picture. The ones marked <b>Do first</b> are the 50 without a cover that appear in the most plans
        (the last 90 days): a plan is remembered by the moment it appears, and a grey box there is what people see most.
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
