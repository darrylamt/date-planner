import { adminDataClient } from "@/lib/adminAuth";
import { tidyName } from "@/lib/nudges";
import { FlyerMaker, type PhotoChoice } from "./FlyerMaker";

export const dynamic = "force-dynamic";

/*
 * Admin → Flyer maker (owner, 15 Nov 2026): the social media person's own
 * flyers in Duro!'s look. A lineup, one event or place with its photo, or an
 * announcement; four colours, three sizes. Photos are chosen from the
 * catalogue, never uploaded or linked, so a flyer only shows what Duro! holds.
 */
export default async function FlyerMakerPage({ searchParams }: { searchParams: { d?: string } }) {
  const db = await adminDataClient(["social"]);
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: events }, { data: venues }] = await Promise.all([
    db.from("events").select("id, title, event_date, image_url, venues(image_url)").eq("is_active", true).gte("event_date", today).order("event_date").limit(400),
    db.from("venues").select("id, name, areas(name)").eq("is_active", true).not("image_url", "is", null).order("name").limit(2000),
  ]);
  type E = { id: string; title: string; event_date: string; image_url: string | null; venues: { image_url: string | null } | null };
  const seen = new Set<string>();
  const photos: PhotoChoice[] = [
    ...((events ?? []) as unknown as E[])
      .filter((e) => (e.image_url || e.venues?.image_url) && !seen.has(e.title.toLowerCase()) && seen.add(e.title.toLowerCase()))
      .map((e) => ({ kind: "event" as const, id: e.id, label: `${tidyName(e.title)} · ${e.event_date}` })),
    ...((venues ?? []) as unknown as { id: string; name: string; areas: { name: string } | null }[]).map((v) => ({
      kind: "venue" as const,
      id: v.id,
      label: `${tidyName(v.name)}${v.areas?.name ? ` · ${v.areas.name}` : ""}`,
    })),
  ];
  let initial: unknown = null;
  try {
    if (searchParams.d) initial = JSON.parse(Buffer.from(searchParams.d, "base64url").toString("utf8"));
  } catch {
    initial = null;
  }
  return (
    <div className="max-w-[1200px]">
      <h1>Flyer maker</h1>
      <p className="mt-1 max-w-[760px] text-[14px] text-mutedbrown">
        Make a flyer in Duro!&apos;s look: a lineup of dates, one event or place with its photo, or an announcement. The picture updates as you type;
        download it when it looks right. Keep names, dates and prices to what is in Duro!.
      </p>
      <FlyerMaker photos={photos} initial={initial} />
    </div>
  );
}
