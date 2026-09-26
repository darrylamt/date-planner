import { supabase } from "./supabase";
import { WELLNESS_KINDS, WELLNESS_TREATMENT_MIN_GHS, treatmentMatches, type WellnessKind } from "./planConstants";
import { randomSlug } from "./format";
import type { Area, Itinerary, MenuItem, PlanInputs, SavedPlan } from "./types";

/**
 * Catalog reads and user writes go straight to Supabase, RLS already scopes
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
  const areas = (data ?? []) as Area[];

  /*
   * Only the areas something live is in.
   *
   * An area with nothing active in it can only produce "we could not plan
   * that", and after the 24 Sep clean-up several did: Kumasi and Kokrobite
   * both had every venue taken off the catalogue for want of a menu. Offering
   * them would be offering a dead end, and a city whose areas are all empty
   * should not appear in the city picker either.
   *
   * Filtering is a courtesy, so any doubt returns the whole list. That
   * includes a result that hits PostgREST's 1,000-row cap, where the missing
   * rows could be the only live venue in some area.
   */
  const { data: live, error: liveError } = await supabase
    .from("venues")
    .select("area_id")
    .eq("is_active", true);
  if (liveError || !live || live.length >= 1000) return areas;
  const used = new Set((live as { area_id: string }[]).map((v) => v.area_id));
  return areas.filter((a) => used.has(a.id));
}

/**
 * The least a spa visit costs one person, or null when there is no spa to go
 * to.
 *
 * Null also covers a database without 0055, where "wellness" is not a venue
 * type yet and the query is refused: the spa option simply does not appear,
 * which is right, because there is nothing it could book.
 */
export type WellnessFloors = Partial<Record<WellnessKind, number>>;

/**
 * The cheapest real treatment of each kind, per person.
 *
 * Per kind because the kinds cost different amounts: a manicure floor would
 * tell somebody a massage fits a budget it does not. A kind with no line at
 * or above the treatment minimum is absent, and the questionnaire does not
 * offer it.
 */
export async function fetchWellnessFloor(): Promise<WellnessFloors | null> {
  const { data: spas, error } = await supabase
    .from("venues")
    .select("id")
    .eq("type", "wellness")
    .eq("is_active", true);
  if (error || !spas?.length) return null;
  const { data: items } = await supabase
    .from("menu_items")
    .select("name, price_ghs")
    .in("venue_id", (spas as { id: string }[]).map((s) => s.id))
    .gte("price_ghs", WELLNESS_TREATMENT_MIN_GHS);
  const rows = (items ?? []) as { name: string; price_ghs: number }[];
  const floors: WellnessFloors = {};
  for (const { id } of WELLNESS_KINDS) {
    const prices = rows.filter((r) => treatmentMatches(id, r.name)).map((r) => Number(r.price_ghs)).filter((n) => n > 0);
    if (prices.length) floors[id] = Math.min(...prices);
  }
  return Object.keys(floors).length ? floors : null;
}

/**
 * The kitchens this catalogue actually has, commonest first.
 *
 * Derived rather than listed, because a hardcoded menu of cuisines is a
 * promise the catalogue has to keep: offering Thai to somebody when no venue
 * serves it produces an evening that ignores the one thing they asked for,
 * and they have no way to tell that from the planner being bad at its job.
 *
 * Cheap enough to do on the questionnaire's behalf -- one column over 194
 * rows -- and it stays right on its own as the catalogue grows.
 */
export async function fetchCuisines(): Promise<{ id: string; label: string }[]> {
  const { data, error } = await supabase
    .from("venues")
    .select("cuisines")
    .eq("is_active", true);
  if (error) return [];

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { cuisines: string[] | null }[]) {
    for (const c of row.cuisines ?? []) {
      const key = c.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  /*
   * Two venues minimum. One venue is not a choice -- picking it either lands
   * you there or, on the night it is closed, silently does nothing, and the
   * second outcome is indistinguishable from the question being ignored.
   */
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => ({ id, label: id.replace(/\b\w/g, (ch) => ch.toUpperCase()) }));
}

export async function fetchVenueContact(venueId: string): Promise<{
  phone: string | null;
  /**
   * The number that takes WhatsApp bookings, when the venue has one.
   *
   * Null is the common case and is not the same as having no phone. Most of
   * these numbers are lines somebody answers, and a booking sent into a
   * WhatsApp account that does not exist fails without telling anybody, which
   * is the worst way for a table to go unbooked.
   */
  whatsapp_phone: string | null;
  /**
   * Where they actually take bookings, when they take them online.
   *
   * Preferred over both numbers, because it is the channel the venue chose
   * for itself: a place with a booking system does not want a WhatsApp
   * message about a table it cannot see in that system.
   */
  booking_url: string | null;
  instagram_handle: string | null;
  reservation_required: boolean;
} | null> {
  const { data } = await supabase
    .from("venues")
    .select("phone, whatsapp_phone, booking_url, instagram_handle, reservation_required")
    .eq("id", venueId)
    .maybeSingle();
  return data ?? null;
}

/**
 * The menu for a stop, through the share if it borrows one.
 *
 * This queried menu_items by the requested id alone, so every branch priced
 * from another row came back empty and the sheet said "no menu on file for
 * this spot yet". Eight active venues were in that state: four Honeysuckles,
 * three Flicks & Licks and Arcadia West Hills, each of them a venue whose
 * menu we hold in full, one row over. The web route was fixed the same way.
 *
 * One level only, enforced by a trigger in 0024, so this is a lookup rather
 * than a walk.
 */
export async function fetchMenu(venueId: string): Promise<MenuItem[]> {
  const { data: venue } = await supabase
    .from("venues")
    .select("menu_shared_from")
    .eq("id", venueId)
    .maybeSingle();

  const owner = (venue as { menu_shared_from?: string | null } | null)?.menu_shared_from || venueId;

  const { data } = await supabase
    .from("menu_items")
    .select("id, venue_id, name, category, price_ghs, notes, dietary_note, is_alcoholic")
    .eq("venue_id", owner)
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
    .select(
      "id, user_id, share_slug, inputs, itinerary, total_budget_ghs, estimated_total_ghs, planner_note, created_at"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedPlan[];
}

/**
 * Attach or change the note shown on a shared plan.
 *
 * Separate from savePlan because the note is usually written after the fact,
 * at the moment of sending it to someone, rather than while planning.
 */
/**
 * One saved plan, by the slug its share link uses.
 *
 * Read on the user's own session, so RLS decides: "plans: own read" matches
 * auth.uid() to user_id, and a slug belonging to somebody else comes back
 * empty rather than readable. The shared web page reads the same row through
 * the service role, which is why that one works signed out and this does not.
 */
export async function fetchPlan(slug: string): Promise<SavedPlan | null> {
  const { data, error } = await supabase
    .from("plans")
    .select(
      "id, user_id, share_slug, inputs, itinerary, total_budget_ghs, estimated_total_ghs, planner_note, created_at"
    )
    .eq("share_slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as SavedPlan | null) ?? null;
}

/**
 * Write back an itinerary that was changed after it was saved.
 *
 * Changing an order on a saved plan used to be a change that lived until the
 * screen closed. Needed migration 0039: plans had read, insert and delete
 * policies and no update policy at all, so every write was refused by RLS and
 * reported as a success, because PostgREST calls an update that matched no
 * rows a success.
 */
export async function updateSavedItinerary(
  slug: string,
  itinerary: Itinerary
): Promise<boolean> {
  const { error } = await supabase
    .from("plans")
    .update({
      itinerary,
      // Kept in step with the itinerary it describes. The saved list shows
      // this figure, so leaving it behind makes the list disagree with the
      // plan it is listing.
      estimated_total_ghs: Math.round(Number(itinerary.est_total_ghs)),
    })
    .eq("share_slug", slug);
  return !error;
}

export async function setPlannerNote(slug: string, note: string): Promise<boolean> {
  const trimmed = note.trim().slice(0, 400);
  const { error } = await supabase
    .from("plans")
    // Blank clears it, so the card goes back to having no note block at all
    // rather than an empty one.
    .update({ planner_note: trimmed || null })
    .eq("share_slug", slug);
  return !error;
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

/**
 * A venue on the home screen's featured shelf.
 *
 * Flattened from the join, because the row is one card and a caller that has
 * to reach through `venues.areas.name` to render a subtitle is a caller that
 * will forget the null check on the day a venue has no area.
 */
export interface FeaturedVenue {
  id: string;
  venue_id: string;
  headline: string | null;
  is_paid: boolean;
  name: string;
  description: string | null;
  image_url: string | null;
  instagram_handle: string | null;
  area: string | null;
}

/**
 * What is featured today.
 *
 * Today rather than "this week": a run can start on a Thursday because that is
 * when the venue's event is, and asking for a calendar week would miss it. The
 * window is filtered in the query so the phone is never sent rows it would
 * throw away.
 *
 * Deliberately not read by the planner. A stop is chosen on fit alone, and the
 * moment a venue can buy its way into an itinerary the itinerary stops being
 * an answer.
 */
export async function fetchFeatured(): Promise<FeaturedVenue[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("featured_venues")
    .select(
      "id, venue_id, headline, is_paid, sort, venues(name, description, image_url, instagram_handle, is_active, areas(name))"
    )
    .lte("starts_on", today)
    .gte("ends_on", today)
    .order("sort");

  if (error) throw error;

  return (data ?? [])
    .map((row: Record<string, unknown>) => {
      const v = row.venues as
        | {
            name: string;
            description: string | null;
            image_url: string | null;
            instagram_handle: string | null;
            is_active: boolean;
            areas: { name: string } | null;
          }
        | null;
      if (!v) return null;
      // A venue that has hidden itself, or been deactivated, must not keep
      // appearing on the home screen because a run was booked before it did.
      if (v.is_active === false) return null;
      return {
        id: row.id as string,
        venue_id: row.venue_id as string,
        headline: (row.headline as string | null) ?? null,
        is_paid: Boolean(row.is_paid),
        name: v.name,
        description: v.description,
        image_url: v.image_url,
        instagram_handle: v.instagram_handle,
        area: v.areas?.name ?? null,
      };
    })
    .filter((r): r is FeaturedVenue => r !== null);
}

/* ── venues, for the Venues tab ──────────────────────────────────────── */

/** One row of the Venues list: enough to recognise a place and choose it. */
export interface VenueListing {
  id: string;
  name: string;
  type: string;
  area: string | null;
  city: string | null;
  image_url: string | null;
  price_band: string | null;
  avg_cost_per_person_ghs: number | null;
  cuisines: string[];
  vibe_tags: string[];
}

/**
 * Every live venue, once, filtered on the phone.
 *
 * Two hundred rows of a dozen short columns is smaller than one photo, and
 * holding them all means search answers on each keystroke rather than after a
 * round trip. Named columns, never "*": the venues grant is column by column
 * and Postgres refuses a star outright.
 */
export async function listVenues(): Promise<VenueListing[]> {
  const { data, error } = await supabase
    .from("venues")
    .select(
      "id, name, type, image_url, price_band, avg_cost_per_person_ghs, cuisines, vibe_tags, areas(name, city)"
    )
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((v: Record<string, unknown>) => {
    const area = v.areas as { name: string; city: string | null } | null;
    return {
      id: v.id as string,
      name: v.name as string,
      type: v.type as string,
      area: area?.name ?? null,
      city: area?.city ?? null,
      image_url: (v.image_url as string | null) ?? null,
      price_band: (v.price_band as string | null) ?? null,
      avg_cost_per_person_ghs: (v.avg_cost_per_person_ghs as number | null) ?? null,
      cuisines: (v.cuisines as string[] | null) ?? [],
      vibe_tags: (v.vibe_tags as string[] | null) ?? [],
    };
  });
}

/** Everything a venue page shows. */
export interface VenueDetail extends VenueListing {
  description: string | null;
  best_for: string[];
  dress_code: string | null;
  gallery_urls: string[];
  instagram_handle: string | null;
  phone: string | null;
  booking_url: string | null;
  google_maps_url: string | null;
  opening_hours_text: string[] | null;
  place_rating: number | null;
  place_rating_count: number | null;
  reservation_required: boolean;
  min_party_size: number | null;
  max_party_size: number | null;
  has_vegetarian_options: boolean | null;
}

export async function fetchVenue(id: string): Promise<VenueDetail | null> {
  const { data, error } = await supabase
    .from("venues")
    .select(
      "id, name, type, image_url, price_band, avg_cost_per_person_ghs, cuisines, vibe_tags, description, best_for, dress_code, gallery_urls, instagram_handle, phone, booking_url, google_maps_url, opening_hours_text, place_rating, place_rating_count, reservation_required, min_party_size, max_party_size, has_vegetarian_options, areas(name, city)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const v = data as Record<string, unknown>;
  const area = v.areas as { name: string; city: string | null } | null;
  return {
    id: v.id as string,
    name: v.name as string,
    type: v.type as string,
    area: area?.name ?? null,
    city: area?.city ?? null,
    image_url: (v.image_url as string | null) ?? null,
    price_band: (v.price_band as string | null) ?? null,
    avg_cost_per_person_ghs: (v.avg_cost_per_person_ghs as number | null) ?? null,
    cuisines: (v.cuisines as string[] | null) ?? [],
    vibe_tags: (v.vibe_tags as string[] | null) ?? [],
    description: (v.description as string | null) ?? null,
    best_for: (v.best_for as string[] | null) ?? [],
    dress_code: (v.dress_code as string | null) ?? null,
    gallery_urls: (v.gallery_urls as string[] | null) ?? [],
    instagram_handle: (v.instagram_handle as string | null) ?? null,
    phone: (v.phone as string | null) ?? null,
    booking_url: (v.booking_url as string | null) ?? null,
    google_maps_url: (v.google_maps_url as string | null) ?? null,
    opening_hours_text: (v.opening_hours_text as string[] | null) ?? null,
    place_rating: (v.place_rating as number | null) ?? null,
    place_rating_count: (v.place_rating_count as number | null) ?? null,
    reservation_required: Boolean(v.reservation_required),
    min_party_size: (v.min_party_size as number | null) ?? null,
    max_party_size: (v.max_party_size as number | null) ?? null,
    has_vegetarian_options: (v.has_vegetarian_options as boolean | null) ?? null,
  };
}
