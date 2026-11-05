import { adminDataClient } from "@/lib/adminAuth";
import { EventsManager } from "@/components/admin/EventsManager";
import { fetchAllRows } from "@/lib/fetchAll";
import type { Area, EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const supabase = await adminDataClient(["events"]);
  const [events, { data: areas }, { data: venues }] = await Promise.all([
    // Every event, not the first thousand: past 1,000 the newest (this week's) were cut off.
    fetchAllRows<EventRow>((a, b) => supabase.from("events").select("*").order("event_date").order("id").range(a, b)),
    supabase.from("areas").select("*").order("name"),
    supabase.from("venues").select("id, name, area_id").order("name"),
  ]);

  return (
    <EventsManager
      events={(events ?? []) as EventRow[]}
      areas={(areas ?? []) as Area[]}
      venues={(venues ?? []) as { id: string; name: string; area_id: string }[]}
    />
  );
}
