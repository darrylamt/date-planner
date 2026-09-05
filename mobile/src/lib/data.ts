import { supabase } from "./supabase";
import { randomSlug } from "./format";
import type { Area, Itinerary, MenuItem, PlanInputs, SavedPlan } from "./types";

/**
 * Catalog reads and user writes go straight to Supabase — RLS already scopes
 * them exactly as the web API routes did (catalog is public-read; plans are
 * owner-only; reservations are public-insert). Only the two Anthropic-backed
 * routes need the web server, and those live in api.ts.
 */

export async function fetchAreas(): Promise<Area[]> {
  const { data, error } = await supabase
    .from("areas")
    .select("id, name, city")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Area[];
}

export async function fetchVenueContact(venueId: string): Promise<{
  phone: string | null;
  instagram_handle: string | null;
  reservation_required: boolean;
} | null> {
  const { data } = await supabase
    .from("venues")
    .select("phone, instagram_handle, reservation_required")
    .eq("id", venueId)
    .maybeSingle();
  return data ?? null;
}

export async function fetchMenu(venueId: string): Promise<MenuItem[]> {
  const { data } = await supabase
    .from("menu_items")
    .select("id, venue_id, name, category, price_ghs, notes")
    .eq("venue_id", venueId)
    .order("category")
    .order("name");
  return (data ?? []) as MenuItem[];
}

export class SignInRequiredError extends Error {
  constructor() {
    super("sign_in_required");
    this.name = "SignInRequiredError";
  }
}

/** Save a plan for the signed-in user; returns the share slug. */
export async function savePlan(inputs: PlanInputs, itinerary: Itinerary): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new SignInRequiredError();

  const { data, error } = await supabase
    .from("plans")
    .insert({
      user_id: user.id,
      share_slug: randomSlug(),
      inputs,
      itinerary,
      total_budget_ghs: inputs.budget,
      estimated_total_ghs: itinerary.est_total_ghs,
    })
    .select("share_slug")
    .single();

  if (error) throw error;
  return data.share_slug as string;
}

export async function listPlans(): Promise<SavedPlan[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, user_id, share_slug, inputs, itinerary, total_budget_ghs, estimated_total_ghs, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedPlan[];
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Log a reservation request. Delivery to the venue is a WhatsApp handoff on
 * the client; this row is the system of record the admin portal reads.
 */
export async function createReservation(input: {
  venueId: string;
  venueName: string;
  planSlug: string | null;
  partySize: number;
  date: string;
  arrivalTime: string;
  guestName: string;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("reservation_requests").insert({
    venue_id: input.venueId,
    venue_name: input.venueName,
    user_id: user?.id ?? null,
    plan_slug: input.planSlug,
    party_size: input.partySize,
    reservation_date: input.date,
    arrival_time: input.arrivalTime,
    guest_name: input.guestName || null,
    status: "requested",
    channel: "whatsapp",
  });

  if (error) throw error;
}
