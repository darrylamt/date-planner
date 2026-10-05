-- The other half of 0013.
--
-- That migration stopped the anon key reading unapproved numbers. It left the
-- same columns open to `authenticated`, because admin is a flag on a profile
-- row rather than a database role: every admin is `authenticated` too, so any
-- grant wide enough for the admin screens was wide enough for every account
-- anyone could create by signing up.
--
-- What makes this safe now is that the thirteen admin pages read through the
-- service role instead, behind the same requireAdmin check they already ran.
-- Reading is elevated only after the caller is shown to be an admin, so the
-- gate has not moved, only the identity the query runs under.

revoke select on public.venues from authenticated;

grant select (
  id, name, type, area_id, vibe_tags, dress_code, price_band,
  avg_cost_per_person_ghs, description, best_for, reservation_required,
  instagram_handle, phone, google_maps_url, image_url, is_active, lat, lng,
  created_at, is_free, google_place_id, business_status, places_synced_at,
  place_rating, place_rating_count, price_level, min_party_size,
  max_party_size, pricing_mode, unit_price_ghs, aesthetics
) on public.venues to authenticated;

-- SELECT only. INSERT, UPDATE and DELETE are untouched, and that distinction
-- is the reason the admin forms still work: they write phone_pending from the
-- browser as the signed-in user, and they never read it back, because the
-- server hands the venue to the form as props. The one client-side select in
-- the admin components is `.insert(...).select("id")`, and id stays granted.
--
-- Who may write is still decided by the `venues: admin write` RLS policy, as
-- before. Column privileges say which columns; RLS says which rows and which
-- people. Both still apply.
