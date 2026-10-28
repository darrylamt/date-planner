import { adminDataClient } from "@/lib/adminAuth";
import { EventsManager } from "@/components/admin/EventsManager";
import type { Area, EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const supabase = await adminDataClient(["events"]);
  const [{ data: events }, { data: areas }, { data: venues }] = await Promise.all([
    supabase.from("events").select("*").order("event_date"),
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
