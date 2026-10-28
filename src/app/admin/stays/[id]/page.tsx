import { notFound } from "next/navigation";
import { adminDataClient } from "@/lib/adminAuth";
import { StayForm, type StayDraft, type StayRoomDraft } from "@/components/admin/StayForm";

export const dynamic = "force-dynamic";

/** One stay, or "new" for a blank one (0099). */
export default async function AdminStayPage({ params }: { params: { id: string } }) {
  const db = await adminDataClient(["stays"]);
  const { data: areas } = await db.from("areas").select("id, name").order("name");
  const today = new Date().toISOString().slice(0, 10);

  let initial: StayDraft = {
    id: null, name: "", kind: "hotel", region: "", town: "", address: "", area_id: "", lat: "", lng: "",
    google_maps_url: "", google_place_id: "", phone: "", whatsapp_phone: "", booking_url: "", email: "",
    description: "", image_url: "", check_in: "14:00", check_out: "11:00", min_nights: "", amenities: [],
    activities: "", notes: "", rates_checked_on: today, is_active: true, rooms: [],
  };

  if (params.id !== "new") {
    const { data: v } = await db
      .from("venues")
      .select("id, name, area_id, lat, lng, google_maps_url, google_place_id, phone, whatsapp_phone, booking_url, description, image_url, is_active, type")
      .eq("id", params.id)
      .maybeSingle();
    if (!v || (v as { type: string }).type !== "stay") notFound();
    const [{ data: d }, { data: rooms }] = await Promise.all([
      db.from("stay_details").select("*").eq("venue_id", params.id).maybeSingle(),
      db.from("stay_rooms").select("*").eq("venue_id", params.id).order("sort"),
    ]);
    const venue = v as Record<string, unknown>;
    const det = (d ?? {}) as Record<string, unknown>;
    const str = (x: unknown) => (x == null ? "" : String(x));
    initial = {
      id: params.id,
      name: str(venue.name),
      kind: str(det.kind) || "hotel",
      region: str(det.region),
      town: str(det.town),
      address: str(det.address),
      area_id: str(venue.area_id),
      lat: str(venue.lat),
      lng: str(venue.lng),
      google_maps_url: str(venue.google_maps_url),
      google_place_id: str(venue.google_place_id),
      phone: str(venue.phone),
      whatsapp_phone: str(venue.whatsapp_phone),
      booking_url: str(venue.booking_url),
      email: str(det.email),
      description: str(venue.description),
      image_url: str(venue.image_url),
      check_in: str(det.check_in),
      check_out: str(det.check_out),
      min_nights: str(det.min_nights),
      amenities: (det.amenities as string[] | undefined) ?? [],
      activities: ((det.activities as string[] | undefined) ?? []).join(", "),
      notes: str(det.notes),
      rates_checked_on: str(det.rates_checked_on),
      is_active: venue.is_active !== false,
      rooms: ((rooms ?? []) as Record<string, unknown>[]).map(
        (r): StayRoomDraft => ({
          id: r.id as string,
          name: str(r.name),
          room_type: str(r.room_type) || "double",
          sleeps: Number(r.sleeps) || 2,
          price_per_night_ghs: r.price_per_night_ghs == null ? null : Number(r.price_per_night_ghs),
          weekend_price_ghs: r.weekend_price_ghs == null ? null : Number(r.weekend_price_ghs),
          breakfast_included: r.breakfast_included === true,
          units: r.units == null ? null : Number(r.units),
          notes: (r.notes as string | null) ?? null,
          is_active: r.is_active !== false,
        })
      ),
    };
  }

  return <StayForm initial={initial} areas={(areas ?? []) as { id: string; name: string }[]} />;
}
