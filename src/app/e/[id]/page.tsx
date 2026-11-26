import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppOnly } from "@/components/shared/AppOnly";
import { createServiceClient } from "@/lib/supabase/server";
import { longDate, time12 } from "@/lib/format";

/*
 * An event shared from the app (aduro://event/<id>), as /v is for a venue
 * (owner, 26 Nov 2026: a shared event sent the ticket link, not Duro!). Its
 * name, when and where, and its poster; the event itself opens in the app.
 */
export const revalidate = 3600;

async function eventOf(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient()
    .from("events")
    .select("title, event_date, start_time, image_url, is_active, venues(name, image_url, areas(name))")
    .eq("id", id)
    .maybeSingle();
  const e = data as {
    title: string;
    event_date: string;
    start_time: string | null;
    image_url: string | null;
    is_active: boolean;
    venues: { name: string; image_url: string | null; areas: { name: string } | null } | null;
  } | null;
  if (!e || !e.is_active) return null;
  const when = [longDate(e.event_date), e.start_time ? time12(e.start_time) : null].filter(Boolean).join(", ");
  const place = e.venues ? [e.venues.name, e.venues.areas?.name].filter(Boolean).join(", ") : null;
  return { name: e.title, where: [when, place].filter(Boolean).join(" · "), image: e.image_url ?? e.venues?.image_url ?? null };
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const e = await eventOf(params.id);
  const base: Metadata = { robots: { index: false, follow: false } };
  if (!e) return { ...base, title: "An event on Duro!" };
  const description = `${e.where}. See it in Duro!`;
  return { ...base, title: e.name, description, openGraph: { title: e.name, description, images: e.image ? [e.image] : [] } };
}

export default async function SharedEventPage({ params }: { params: { id: string } }) {
  const e = await eventOf(params.id);
  if (!e) notFound();
  return <AppOnly eyebrow="An event on Duro!" name={e.name} where={e.where} image={e.image} appPath={`event/${params.id}`} />;
}
