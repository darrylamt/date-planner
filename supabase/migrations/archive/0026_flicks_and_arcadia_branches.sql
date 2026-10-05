-- Flicks & Licks is four locations, Arcadia is two, and each is one menu.
--
-- Same shape as 0025. The catalogue held one row per chain, the one whose menu
-- somebody had already typed in: Flicks & Licks - Dansoman with 22 items and
-- ten mains, Arcadia (Spintex) with four. The other four branches were simply
-- missing, so a plan for someone in Achimota or out at West Hills sent them
-- across town to Dansoman or Spintex for food and games available a few
-- minutes away.
--
-- The branches are priced through menu_shared_from rather than by copying the
-- items. Flicks & Licks alone would be 66 duplicated rows to keep in step by
-- hand, and the day a price changes is the day three of them go wrong.
--
-- ── on the numbers ──────────────────────────────────────────────────────
-- Every number here lands in phone_pending. Nothing in this file makes one
-- dialable, because that gate is the one thing in this catalogue only a person
-- may open, and these came from Google rather than from the operator.
--
-- ── on Mile 7 ───────────────────────────────────────────────────────────
-- Its Google listing is not trustworthy and is treated accordingly. The pin
-- sits at 5.5602, -0.1969, which is Korle Klottey in central Accra, nine
-- kilometres from the "Mile 7, T-Junction" in its own address and from the
-- "Nii Okaiman West Main Rd" the operator publishes. It also claims to be open
-- 24 hours a day, seven days a week, against the 12:00-23:00 on the operator's
-- own site, and the whole listing rests on three reviews. So: the coordinates
-- are the geocode of the address the operator gives, not Google's pin, and the
-- hours are left null. Null means unknown, which the planner treats as neither
-- open nor closed. A wrong pin routes a taxi to the wrong side of Accra, and
-- guessing beats nothing only when the guess is better than nothing.

-- ── the area West Hills Mall sits in ────────────────────────────────────
-- Weija is new. The mall is at Dunkonah on the Winneba road, nine kilometres
-- from Dansoman, which is the nearest area already on file, and filing it
-- there would put every transport estimate out by that much. Guarded on
-- lower(name) because areas has no unique constraint on name and the scalar
-- subqueries below would raise on a duplicate.
insert into public.areas (name, city)
select 'Weija', 'Accra'
where not exists (select 1 from public.areas where lower(name) = 'weija');

-- ── the two menu owners must own their menus ────────────────────────────
-- Before the inserts, not after. The one-level trigger from 0024 rejects a
-- branch pointing at a venue that is itself borrowing, so a parent left
-- non-null would fail every insert below. 0025 did this afterwards and got
-- away with it only because Osu happened to be null already.
--
-- The blank vibe and best_for arrays are filled at the same time. Both rows
-- were imported with empty ones, which leaves the parent matching almost
-- nothing while its own branches match properly, and the fix belongs with the
-- rest of the chain rather than in a later pass.
update public.venues set
  menu_shared_from = null,
  cuisine = coalesce(cuisine, 'both'),
  vibe_tags = case
    when coalesce(array_length(vibe_tags, 1), 0) = 0
    then array['lively', 'casual', 'fun']
    else vibe_tags end,
  best_for = case
    when coalesce(array_length(best_for, 1), 0) = 0
    then array['friend_outing', 'date_night', 'casual_hangout']
    else best_for end
where name = 'Flicks & Licks - Dansoman';

update public.venues set
  menu_shared_from = null
where name = 'Arcadia (Spintex)';

-- ── the three missing Flicks & Licks branches ──────────────────────────
insert into public.venues (
  name, type, area_id, price_band, avg_cost_per_person_ghs, description,
  vibe_tags, best_for, reservation_required, is_free, is_active,
  pricing_mode, price_source, cuisine,
  menu_shared_from,
  google_place_id, google_maps_url, lat, lng,
  phone_pending, phone_status, phone_source,
  business_status, place_rating, place_rating_count, places_synced_at,
  opening_periods, opening_hours_text, hours_synced_at
)
select
  x.name, 'restaurant',
  (select id from public.areas where lower(name) = x.area_key),
  'mid',
  -- A main is 110 to 150 and a side 35 to 40, so 150 is a fair single cover.
  -- Only ever a fallback: the share resolves to a real 22-item menu, and this
  -- is what keeps the row plannable and out of the unpriced queue if it does
  -- not.
  150,
  x.description,
  array['lively', 'casual', 'fun'],
  array['friend_outing', 'date_night', 'casual_hangout'],
  false, false, true,
  'per_person', 'menu', 'both',
  -- Priced from Dansoman, which owns the menu.
  (select id from public.venues where name = 'Flicks & Licks - Dansoman'),
  x.place_id, 'https://www.google.com/maps/place/?q=place_id:' || x.place_id,
  x.lat, x.lng,
  x.phone, 'pending', 'Google listing for the branch, unreviewed',
  'OPERATIONAL', x.rating, x.rating_count, now(),
  x.periods::jsonb, x.hours_text, case when x.periods is null then null else now() end
from (values
  (
    'Flicks & Licks - Kingsby Achimota', 'achimota',
    'The Kingsby branch on Justice A. Brobbey Avenue, Achimota. Same menu as the rest of Flicks & Licks: suya, loaded fries, shawarma and grills, from eight in the morning until eleven at night.',
    'ChIJR73NdQCF3w8RsqzmIzhzYZE', 5.6277394, -0.2426202, '+233 30 220 8054',
    3.9, 99,
    '[{"open":{"day":0,"hour":8,"minute":0},"close":{"day":0,"hour":23,"minute":0}},
      {"open":{"day":1,"hour":8,"minute":0},"close":{"day":1,"hour":23,"minute":0}},
      {"open":{"day":2,"hour":8,"minute":0},"close":{"day":2,"hour":23,"minute":0}},
      {"open":{"day":3,"hour":8,"minute":0},"close":{"day":3,"hour":23,"minute":0}},
      {"open":{"day":4,"hour":8,"minute":0},"close":{"day":4,"hour":23,"minute":0}},
      {"open":{"day":5,"hour":8,"minute":0},"close":{"day":5,"hour":23,"minute":0}},
      {"open":{"day":6,"hour":8,"minute":0},"close":{"day":6,"hour":23,"minute":0}}]',
    array['Monday: 8:00 AM - 11:00 PM','Tuesday: 8:00 AM - 11:00 PM','Wednesday: 8:00 AM - 11:00 PM','Thursday: 8:00 AM - 11:00 PM','Friday: 8:00 AM - 11:00 PM','Saturday: 8:00 AM - 11:00 PM','Sunday: 8:00 AM - 11:00 PM']
  ),
  (
    'Flicks & Licks - East Legon', 'east legon',
    'The East Legon branch on Lagos Avenue. Same menu as the rest of Flicks & Licks, open from eight in the morning until eleven at night.',
    'ChIJqXzFRayb3w8RnkAiYWP13-Q', 5.6304923, -0.1731669, '+233 24 243 8720',
    3.6, 139,
    '[{"open":{"day":0,"hour":8,"minute":0},"close":{"day":0,"hour":23,"minute":0}},
      {"open":{"day":1,"hour":8,"minute":0},"close":{"day":1,"hour":23,"minute":0}},
      {"open":{"day":2,"hour":8,"minute":0},"close":{"day":2,"hour":23,"minute":0}},
      {"open":{"day":3,"hour":8,"minute":0},"close":{"day":3,"hour":23,"minute":0}},
      {"open":{"day":4,"hour":8,"minute":0},"close":{"day":4,"hour":23,"minute":0}},
      {"open":{"day":5,"hour":8,"minute":0},"close":{"day":5,"hour":23,"minute":0}},
      {"open":{"day":6,"hour":8,"minute":0},"close":{"day":6,"hour":23,"minute":0}}]',
    array['Monday: 8:00 AM - 11:00 PM','Tuesday: 8:00 AM - 11:00 PM','Wednesday: 8:00 AM - 11:00 PM','Thursday: 8:00 AM - 11:00 PM','Friday: 8:00 AM - 11:00 PM','Saturday: 8:00 AM - 11:00 PM','Sunday: 8:00 AM - 11:00 PM']
  ),
  (
    'Flicks & Licks - Mile 7', 'achimota',
    'The Mile 7 branch at the T-Junction, on Nii Okaiman West Main Road. Same menu as the rest of Flicks & Licks. Its Google listing is unreliable, so the location here is the geocode of the operator''s own address and the opening hours are not on file yet.',
    'ChIJq8_oKwaR3w8R3MAsASIMEm0',
    -- Nii Okaiman West Main Road, per the address the operator publishes.
    -- Google's own pin for this listing is in central Accra and wrong.
    5.6258911, -0.2550216,
    '+233 56 013 6494',
    3.7, 3,
    -- "Open 24 hours" every day, against 12:00-23:00 on the operator's site.
    -- Unknown is the honest value.
    null,
    null
  )
) as x(name, area_key, description, place_id, lat, lng, phone, rating, rating_count, periods, hours_text)
-- Guarded on name as well as place id. A null place id never equals anything,
-- so a place-id-only guard silently stops deduplicating and re-running the
-- migration doubles the rows.
where not exists (
  select 1 from public.venues v
  where v.google_place_id = x.place_id or v.name = x.name
);

-- ── the second Arcadia ─────────────────────────────────────────────────
insert into public.venues (
  name, type, area_id, price_band, avg_cost_per_person_ghs, description,
  vibe_tags, best_for, reservation_required, is_free, is_active,
  pricing_mode, price_source,
  menu_shared_from,
  google_place_id, google_maps_url, lat, lng,
  phone_pending, phone_status, phone_source,
  business_status, places_synced_at,
  opening_periods, opening_hours_text, hours_synced_at
)
select
  'Arcadia (West Hills Mall)', 'activity',
  (select id from public.areas where lower(name) = 'weija'),
  'budget',
  -- One bag of ten tokens, which is the unit people actually buy.
  80,
  'Arcade at West Hills Mall, Dunkonah, with token games, ticket redemption and VR. Same price list as the Spintex branch. Closed Mondays.',
  array['fun', 'lively', 'casual'],
  array['friend_outing', 'date_night', 'casual_hangout'],
  false, false, true,
  'per_person', 'menu',
  -- Priced from Spintex, which owns the price list.
  (select id from public.venues where name = 'Arcadia (Spintex)'),
  'ChIJyZrZXfq93w8RXhAz17_ws8k',
  'https://www.google.com/maps/place/?q=place_id:ChIJyZrZXfq93w8RXhAz17_ws8k',
  5.5445381, -0.3425107,
  '+233 55 511 4791', 'pending', 'Google listing for the branch, unreviewed',
  'OPERATIONAL', now(),
  -- Monday is missing on purpose: the branch is shut, and an absent day is how
  -- that is said. Tuesday to Thursday 13:00-22:00, Friday to Sunday
  -- 11:00-23:00, same as Spintex.
  '[{"open":{"day":0,"hour":11,"minute":0},"close":{"day":0,"hour":23,"minute":0}},
    {"open":{"day":2,"hour":13,"minute":0},"close":{"day":2,"hour":22,"minute":0}},
    {"open":{"day":3,"hour":13,"minute":0},"close":{"day":3,"hour":22,"minute":0}},
    {"open":{"day":4,"hour":13,"minute":0},"close":{"day":4,"hour":22,"minute":0}},
    {"open":{"day":5,"hour":11,"minute":0},"close":{"day":5,"hour":23,"minute":0}},
    {"open":{"day":6,"hour":11,"minute":0},"close":{"day":6,"hour":23,"minute":0}}]'::jsonb,
  array['Monday: Closed','Tuesday: 1:00 - 10:00 PM','Wednesday: 1:00 - 10:00 PM','Thursday: 1:00 - 10:00 PM','Friday: 11:00 AM - 11:00 PM','Saturday: 11:00 AM - 11:00 PM','Sunday: 11:00 AM - 11:00 PM'],
  now()
where not exists (
  select 1 from public.venues
  where google_place_id = 'ChIJyZrZXfq93w8RXhAz17_ws8k'
     or name = 'Arcadia (West Hills Mall)'
);

-- ── every new branch's number, as an alternate too ─────────────────────
-- Same as 0025, so once approved the numbers are all in one place and a branch
-- reachable on a second line has somewhere to put it.
--
-- Named rows rather than a `like 'Flicks & Licks - %'` sweep across the chain.
-- The sweep would also pick up the two menu owners, whose phone_pending is a
-- duplicate of their own already-approved number, and file that duplicate here
-- as a fresh pending alternate, which is the very thing 0028 exists to undo.
insert into public.venue_phones (venue_id, number, label, status, source, sort_order)
select v.id, v.phone_pending, 'Branch line', 'pending',
       'Google listing for the branch, unreviewed', 0
from public.venues v
where v.phone_pending is not null
  and v.name in (
    'Flicks & Licks - Kingsby Achimota',
    'Flicks & Licks - East Legon',
    'Flicks & Licks - Mile 7',
    'Arcadia (West Hills Mall)'
  )
on conflict (venue_id, number) do nothing;
