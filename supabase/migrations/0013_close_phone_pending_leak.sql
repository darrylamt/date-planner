-- The phone approval gate was open at the back.
--
-- The linter flagged venue_phone_collisions for being SECURITY DEFINER, which
-- it was. Chasing that turned up the larger problem underneath: the view was
-- not the leak, the table was.
--
-- `venues: public read` is `using (true)` and RLS is row-level, so it grants
-- every column to everyone. Verified against the live database with nothing
-- but the anon key that ships inside the app bundle: 50 venues readable, 43 of
-- them exposing phone_pending. Those are the unapproved numbers. The entire
-- point of the approval gate in migration 0004 is that an unreviewed number is
-- never shown to anyone, because the reservation flow dials it under our name
-- and a hijacked listing becomes fraud committed as us. Harvesting all 43 took
-- one request.
--
-- RLS cannot fix this: it filters rows, not columns. Column privileges can.

-- ── 1. Column grants for the anon role ──────────────────────────────────
--
-- anon is the key compiled into the app, so treat it as public knowledge.
-- Revoke the lot, then hand back only what a signed-out client legitimately
-- reads. Planning runs server-side under the service role, which bypasses all
-- of this, so the app itself needs very little here.

revoke select on public.venues from anon;

grant select (
  id, name, type, area_id, vibe_tags, dress_code, price_band,
  avg_cost_per_person_ghs, description, best_for, reservation_required,
  instagram_handle, phone, google_maps_url, image_url, is_active, lat, lng,
  created_at, is_free, google_place_id, business_status, places_synced_at,
  place_rating, place_rating_count, price_level, min_party_size,
  max_party_size, pricing_mode, unit_price_ghs, aesthetics
) on public.venues to anon;

-- Withheld: every phone_* column except the approved `phone`, and every
-- verification_* column. The approved number is meant to be dialled. The
-- pending one, who approved it, who reported it, and what the verifier thought
-- of the place are all internal.

-- ── 2. The view the linter actually named ───────────────────────────────
--
-- A SECURITY DEFINER view runs as its creator, so it reads the underlying
-- table with the owner's rights and ignores both RLS and the column grants
-- above. Left alone it would have handed back exactly the phone_pending data
-- step 1 just took away.

alter view public.venue_phone_collisions set (security_invoker = on);

-- ── Still open, and deliberately not fixed here ─────────────────────────
--
-- A signed-in user is the `authenticated` role, and so is every admin, because
-- admin is a flag on a profile row rather than a database role. The same
-- column grants applied to `authenticated` would therefore lock all fourteen
-- admin pages out of the columns they exist to manage.
--
-- Closing it properly means moving those pages onto the service-role client
-- behind the requireAdmin check they already run. That is a refactor with real
-- breakage risk and does not belong in a security patch written in one pass.
-- Recorded here so it is not mistaken for finished: today, an ordinary
-- signed-in account can still read phone_pending.
