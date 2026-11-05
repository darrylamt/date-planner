import { supabase } from "./supabase";

/** An event as its page and the events list show it: the night, and where it is. */
export interface EventDetail {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  cost_ghs: number | null;
  category: string;
  description: string | null;
  image_url: string | null;
  booking_url: string | null;
  source_url: string | null;
  contact_phone: string | null;
  organiser_name: string | null;
  reservation_required: boolean;
  venue: { id: string; name: string; image_url: string | null; google_maps_url: string | null; area: string | null } | null;
}

const COLUMNS =
  "id, title, event_date, start_time, cost_ghs, category, description, image_url, booking_url, source_url, contact_phone, organiser_name, reservation_required, venues(id, name, image_url, google_maps_url, areas(name))";

type Row = Omit<EventDetail, "venue"> & {
  venues: { id: string; name: string; image_url: string | null; google_maps_url: string | null; areas: { name: string } | null } | null;
};

function shape(r: Row): EventDetail {
  const { venues: v, ...rest } = r;
  return {
    ...rest,
    description: rest.description ?? null,
    reservation_required: Boolean(rest.reservation_required),
    venue: v ? { id: v.id, name: v.name, image_url: v.image_url, google_maps_url: v.google_maps_url, area: v.areas?.name ?? null } : null,
  };
}

export async function fetchEvent(id: string): Promise<EventDetail | null> {
  const { data, error } = await supabase.from("events").select(COLUMNS).eq("id", id).eq("is_active", true).maybeSingle();
  if (error || !data) return null;
  return shape(data as unknown as Row);
}

/** Everything on from today for the next few weeks, soonest first. */
export async function fetchUpcomingEvents(days = 28): Promise<EventDetail[]> {
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const until = new Date(today.getTime() + days * 864e5);
  const { data, error } = await supabase
    .from("events")
    .select(COLUMNS)
    .eq("is_active", true)
    .gte("event_date", iso(today))
    .lte("event_date", iso(until))
    .order("event_date")
    .order("start_time", { nullsFirst: false })
    .limit(1000);
  if (error) return [];
  return ((data ?? []) as unknown as Row[]).map(shape);
}

/** Where to book or get tickets, named for where it goes: Gaderin's own listing keeps its link. */
export function bookingOf(e: Pick<EventDetail, "booking_url" | "source_url">): { url: string; label: string } | null {
  const url = e.booking_url || e.source_url;
  if (!url) return null;
  return { url, label: /gaderin/i.test(url) ? "Book on Gaderin" : "Get tickets" };
}

/** "7:00 PM", or null when no time is on file. */
export function eventTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "Free", "GHS 150", or null when nobody has recorded a price. */
export function eventPrice(cost: number | null): string | null {
  if (cost == null) return null;
  return Number(cost) === 0 ? "Free" : `GHS ${Math.round(Number(cost)).toLocaleString()}`;
}
