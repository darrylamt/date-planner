/**
 * The venue columns a signed-out or signed-in visitor may read.
 *
 * This exists because `select("*")` cannot work here and never will again.
 * Migration 0013 revoked the blanket venue grant and replaced it with a column
 * list, so unapproved phone numbers and the verification internals stay
 * private; 0014 did the same for signed-in users. Postgres refuses `SELECT *`
 * outright when any single column is ungranted rather than returning the rest,
 * so from 0014 onwards every plan request died with "permission denied for
 * table venues", and the app reported it as "We couldn't reach the venue
 * catalog." It had nothing to do with the catalogue.
 *
 * Naming the columns changes the failure mode, which is the real point. A
 * column missing from this list is a field the planner cannot see: a feature
 * quietly absent, which is bad. A column missing from the grants while the
 * query says `*` is the whole product down, which is much worse. Prefer the
 * first kind of mistake.
 *
 * Verified against the live database with the anon key that ships in the app:
 * these 37 read, and the 13 phone_* and verification_* columns are refused,
 * which is exactly what 0013 and 0014 intended.
 *
 * When a migration adds a venue column that the app should read, it goes in
 * two places: a `grant select (col) on venues to anon, authenticated` in the
 * migration, and this list. Miss the grant and the column reads as absent;
 * miss this list and nothing breaks, the field is simply not there.
 */
export const PUBLIC_VENUE_COLUMNS = [
  "id",
  "name",
  "type",
  "area_id",
  "description",
  "vibe_tags",
  "best_for",
  "dress_code",
  "price_band",
  "avg_cost_per_person_ghs",
  "reservation_required",
  "instagram_handle",
  // The approved number only. phone_pending is deliberately not here.
  "phone",
  "google_maps_url",
  "image_url",
  "is_active",
  "is_free",
  "min_party_size",
  "max_party_size",
  "pricing_mode",
  "unit_price_ghs",
  "minimum_spend_ghs",
  "cuisine",
  "aesthetics",
  "price_source",
  "price_spread",
  "opening_periods",
  "opening_hours_text",
  "hours_synced_at",
  "google_place_id",
  "business_status",
  "price_level",
  "place_rating",
  "place_rating_count",
  "places_synced_at",
  "lat",
  "lng",
  "created_at",
] as const;

/** Ready to hand to `.select()`, with the area name joined on. */
export const VENUE_SELECT = `${PUBLIC_VENUE_COLUMNS.join(",")},areas(name)`;

/** Without the join, for queries that do not need the area's name. */
export const VENUE_SELECT_FLAT = PUBLIC_VENUE_COLUMNS.join(",");
