import { adminDataClient } from "@/lib/adminAuth";
import { fetchAllRows } from "@/lib/fetchAll";
import { GaderinActivities, type GaderinRow } from "@/components/admin/GaderinActivities";

export const dynamic = "force-dynamic";

const DAYS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

/** "Weekly, Mon, Tue, Thu" or "Sat 11 Oct 2026", as Gaderin holds it. */
function whenOf(a: { is_recurring: boolean; recurrence: { day: string }[] | null; event_date: string | null; start_time: string | null }): string {
  if (a.is_recurring && a.recurrence?.length) {
    return `Weekly, ${a.recurrence.map((r) => DAYS[r.day?.toLowerCase()] ?? r.day).join(", ")}`;
  }
  if (!a.event_date) return "No date";
  const d = new Date(`${a.event_date}T12:00:00Z`);
  const past = a.event_date < new Date().toISOString().slice(0, 10);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}${a.start_time ? ` ${a.start_time}` : ""}${past ? " (past)" : ""}`;
}

/**
 * Activities read from Gaderin each night (scripts/scrape-gaderin.ts) that
 * still need a Duro venue, and the ones that have one.
 */
export default async function AdminGaderinPage() {
  const supabase = await adminDataClient();

  const [activities, venues] = await Promise.all([
    fetchAllRows<any>((from, to) =>
      supabase
        .from("gaderin_activities")
        .select("slug,url,title,host_name,location,category,price_ghs,image_url,venue_id,dismissed,is_recurring,recurrence,event_date,start_time,scraped_at")
        .eq("is_active", true)
        .order("title")
        .range(from, to)
    ),
    /*
     * Switched-off places too, marked: most were switched off for having no
     * price of their own, and a Gaderin event brings its own. Permanently
     * closed ones stay out; there is no door to send anybody to.
     */
    fetchAllRows<any>((from, to) =>
      supabase.from("venues").select("id,name,is_active,business_status,areas(name)").order("name").range(from, to)
    ),
  ]);

  const linkable = venues.filter((v: any) => v.business_status !== "CLOSED_PERMANENTLY");
  const venueName = new Map(venues.map((v: any) => [v.id, v.name as string]));
  const rows: GaderinRow[] = activities.map((a: any) => ({
    slug: a.slug,
    url: a.url,
    title: a.title ?? a.slug,
    host: a.host_name,
    location: a.location,
    category: a.category,
    price: a.price_ghs == null ? null : Number(a.price_ghs),
    when: whenOf(a),
    image: a.image_url,
    venueId: a.venue_id,
    venueName: a.venue_id ? venueName.get(a.venue_id) ?? "A venue no longer listed" : null,
    dismissed: Boolean(a.dismissed),
  }));
  const lastRun = activities.reduce((m: string, a: any) => (a.scraped_at > m ? a.scraped_at : m), "");

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Gaderin</h1>
      <p className="mt-1 max-w-[720px] text-[14px] text-mutedbrown">
        Activities read from thegaderin.com every night at 03:00. Ones placed at a Duro venue become dated events the
        planner can use, booked on Gaderin: the next two weeks of a weekly one, or the date of a one-off. Link the rest
        to the venue they happen at, or set them aside when Duro cannot use them. Links show up as events after the
        next nightly run. A switched-off place can be linked too, and linking switches it back on: the event is its
        price, so without one of its own it still only appears in plans through its events.
        {lastRun ? ` Last read ${new Date(lastRun).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} (Accra).` : " Not read yet."}
      </p>
      <GaderinActivities
        rows={rows}
        venues={linkable.map((v: any) => ({
          id: v.id,
          label: `${v.name}${v.areas?.name ? ` (${v.areas.name})` : ""}${v.is_active ? "" : " (switched off)"}`,
        }))}
      />
    </div>
  );
}
