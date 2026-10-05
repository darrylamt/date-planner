-- The Honeysuckle, five branches, one menu.
--
-- Run after 0024. The Osu row already exists and already holds the 182-item
-- menu, so it keeps it and the other four are priced from it. That is the
-- whole reason menu_shared_from exists: the alternative was 728 duplicate rows
-- and four chances to forget a price change.
--
-- Every coordinate, rating and set of opening hours below came from the live
-- Places API. The phone numbers came from you, and where Google disagreed I
-- have kept yours and said so rather than quietly picking one:
--
--   East Legon  0245615128  Google agrees
--   Spintex     0531100401  Google agrees
--   Labone      0558007995  Google lists +233 27 956 0000 instead
--   Osu         0275556006  the row currently holds +233 30 278 0774 pending
--   Airport     0551115522  Google has no number for it
--
-- All five arrive as pending. Nothing here makes a number dialable, because
-- that gate is the one thing in this catalogue that only a person may open.

-- ── the four new branches ───────────────────────────────────────────────
insert into venues (
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
  (select id from areas where lower(name) = x.area_key),
  'mid', 150, x.description,
  array['lively', 'casual', 'fun'],
  array['friend_outing', 'date_night', 'first_date'],
  false, false, true,
  'per_person', 'menu', 'both',
  -- Priced from Osu, which owns the menu.
  (select id from venues where name = 'The Honeysuckle - Osu'),
  x.place_id, 'https://www.google.com/maps/place/?q=place_id:' || x.place_id,
  x.lat, x.lng,
  x.phone, 'pending', 'branch list supplied by the operator, unreviewed',
  'OPERATIONAL', x.rating, x.rating_count, now(),
  x.periods::jsonb, x.hours_text, now()
from (values
  (
    'The Honeysuckle - East Legon', 'east legon',
    'The East Legon branch, at A&C Mall. Same menu as the rest of The Honeysuckle: pub food, grills and a long drinks list, open from eight in the morning until midnight.',
    'ChIJSY47W1Sb3w8RaONDI9XdQ08', 5.6422572, -0.1523451, '+233 24 561 5128',
    4.4, 3475,
    '[{"open":{"day":0,"hour":8,"minute":0},"close":{"day":1,"hour":0,"minute":0}},
      {"open":{"day":1,"hour":8,"minute":0},"close":{"day":2,"hour":0,"minute":0}},
      {"open":{"day":2,"hour":8,"minute":0},"close":{"day":3,"hour":0,"minute":0}},
      {"open":{"day":3,"hour":8,"minute":0},"close":{"day":4,"hour":0,"minute":0}},
      {"open":{"day":4,"hour":8,"minute":0},"close":{"day":5,"hour":0,"minute":0}},
      {"open":{"day":5,"hour":8,"minute":0},"close":{"day":6,"hour":0,"minute":0}},
      {"open":{"day":6,"hour":8,"minute":0},"close":{"day":0,"hour":0,"minute":0}}]',
    array['Sunday: 8:00 AM - 12:00 AM','Monday: 8:00 AM - 12:00 AM','Tuesday: 8:00 AM - 12:00 AM','Wednesday: 8:00 AM - 12:00 AM','Thursday: 8:00 AM - 12:00 AM','Friday: 8:00 AM - 12:00 AM','Saturday: 8:00 AM - 12:00 AM']
  ),
  (
    'The Honeysuckle - Labone', 'labone',
    'The Labone branch, on Fourth Dade Walk. Same menu as the rest of The Honeysuckle, open from nine and later on a Saturday.',
    'ChIJk3qj2fKb3w8RhusjB7Kuj0A', 5.5739717, -0.1726996, '+233 55 800 7995',
    4.4, 2734,
    '[{"open":{"day":0,"hour":9,"minute":0},"close":{"day":1,"hour":0,"minute":0}},
      {"open":{"day":1,"hour":9,"minute":0},"close":{"day":2,"hour":0,"minute":0}},
      {"open":{"day":2,"hour":9,"minute":0},"close":{"day":3,"hour":0,"minute":0}},
      {"open":{"day":3,"hour":9,"minute":0},"close":{"day":4,"hour":0,"minute":0}},
      {"open":{"day":4,"hour":9,"minute":0},"close":{"day":5,"hour":0,"minute":0}},
      {"open":{"day":5,"hour":9,"minute":0},"close":{"day":6,"hour":0,"minute":0}},
      {"open":{"day":6,"hour":9,"minute":0},"close":{"day":0,"hour":2,"minute":0}}]',
    array['Sunday: 9:00 AM - 12:00 AM','Monday: 9:00 AM - 12:00 AM','Tuesday: 9:00 AM - 12:00 AM','Wednesday: 9:00 AM - 12:00 AM','Thursday: 9:00 AM - 12:00 AM','Friday: 9:00 AM - 12:00 AM','Saturday: 9:00 AM - 2:00 AM']
  ),
  (
    'The Honeysuckle - Spintex', 'spintex',
    'The Spintex Road branch. Same menu as the rest of The Honeysuckle, and the latest closing of the five: one in the morning on a weekday, two at the weekend.',
    'ChIJx1GE-XaF3w8R6CnGca1GJZs', 5.6347291, -0.1348217, '+233 53 110 0401',
    4.3, 251,
    '[{"open":{"day":0,"hour":8,"minute":0},"close":{"day":1,"hour":1,"minute":0}},
      {"open":{"day":1,"hour":8,"minute":0},"close":{"day":2,"hour":1,"minute":0}},
      {"open":{"day":2,"hour":8,"minute":0},"close":{"day":3,"hour":1,"minute":0}},
      {"open":{"day":3,"hour":8,"minute":0},"close":{"day":4,"hour":1,"minute":0}},
      {"open":{"day":4,"hour":8,"minute":0},"close":{"day":5,"hour":1,"minute":0}},
      {"open":{"day":5,"hour":8,"minute":0},"close":{"day":6,"hour":2,"minute":0}},
      {"open":{"day":6,"hour":8,"minute":0},"close":{"day":0,"hour":2,"minute":0}}]',
    array['Sunday: 8:00 AM - 1:00 AM','Monday: 8:00 AM - 1:00 AM','Tuesday: 8:00 AM - 1:00 AM','Wednesday: 8:00 AM - 1:00 AM','Thursday: 8:00 AM - 1:00 AM','Friday: 8:00 AM - 2:00 AM','Saturday: 8:00 AM - 2:00 AM']
  ),
  (
    'The Honeysuckle - Airport', 'airport residential',
    'The Airport Residential branch. Same menu as the rest of The Honeysuckle. Google holds no opening hours for this one, so nothing yet stops a plan sending someone here on a day it is shut.',
    'ChIJJQ6kdxKb3w8RVOJKnInZnLQ', 5.5982777, -0.1806565, '+233 55 111 5522',
    4.1, 130,
    -- Genuinely absent from Google rather than left out here. Null means
    -- unknown, which the planner treats as neither open nor closed.
    null,
    null
  )
) as x(name, area_key, description, place_id, lat, lng, phone, rating, rating_count, periods, hours_text)
where not exists (select 1 from venues where google_place_id = x.place_id);

-- ── the Osu row ─────────────────────────────────────────────────────────
-- It owns the menu, so it must not point anywhere, and its number is the one
-- from your list rather than the switchboard currently sitting pending.
update venues set
  menu_shared_from = null,
  cuisine = coalesce(cuisine, 'both'),
  phone_pending = '+233 27 555 6006',
  phone_status = case when phone is null then 'pending' else phone_status end,
  phone_source = 'branch list supplied by the operator, unreviewed'
where name = 'The Honeysuckle - Osu';

-- ── every branch's number, as an alternate too ──────────────────────────
-- So the numbers are all in one place once approved, and a branch reachable on
-- more than one line has somewhere to put the second.
insert into public.venue_phones (venue_id, number, label, status, source, sort_order)
select v.id, v.phone_pending, 'Branch line', 'pending',
       'branch list supplied by the operator, unreviewed', 0
from venues v
where v.name like 'The Honeysuckle%' and v.phone_pending is not null
on conflict (venue_id, number) do nothing;
