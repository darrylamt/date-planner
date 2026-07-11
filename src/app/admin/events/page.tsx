import { createClient } from "@/lib/supabase/server";
import { EventsManager } from "@/components/admin/EventsManager";
import type { Area, EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const supabase = createClient();
  const [{ data: events }, { data: areas }, { data: venues }] = await Promise.all([
    supabase.from("events").select("*").order("event_date"),
    supabase.from("areas").select("*").order("name"),
    supabase.from("venues").select("id, name").order("name"),
  ]);

  return (
    <EventsManager
      events={(events ?? []) as EventRow[]}
      areas={(areas ?? []) as Area[]}
      venues={(venues ?? []) as { id: string; name: string }[]}
    />
  );
}
