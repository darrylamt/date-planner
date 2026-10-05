-- Game It Up, Bliss and Cypher Zone, priced off their own posters.
--
-- Run this only after 0019 has committed. Postgres refuses to use an enum
-- value in the transaction that added it, and this file writes 'activity'.
--
-- Every venue, coordinate, phone number and set of opening hours below was
-- read from the live Places API rather than recalled. Every price was read off
-- the published price lists. Two lines that were cut off in the photographs
-- are deliberately absent and listed at the bottom of this file: inventing
-- them would put a made-up figure in somebody's evening, which is the one
-- thing this catalogue must never do.
--
-- Both existing rows were carrying a guess dressed as a menu price. Bliss sat
-- at GHS 220 per person with a single line item literally called "Typical
-- spend, per person", marked price_source = 'menu'; its real prices are 100 to
-- 175. Cypher Zone sat at GHS 300 per person with no menu items at all and the
-- same 'menu' label; its real prices are 100 to 150. Both are corrected here.

-- ── Area ────────────────────────────────────────────────────────────────
-- Game It Up sits in Atlantic Mall at Atomic Junction, which is not an area
-- the catalogue has. Confirmed by what stands around it: Atlantic Mall, Centre
-- Point Mall, Atomic Junction Bus Station, all within 400 metres.
insert into areas (name, city)
select 'Atomic Junction', 'Accra'
where not exists (select 1 from areas where lower(name) = 'atomic junction');

-- ── Game It Up ──────────────────────────────────────────────────────────
insert into venues (
  name, type, area_id, price_band, avg_cost_per_person_ghs, description,
  vibe_tags, best_for, reservation_required, is_free, is_active,
  pricing_mode, price_source, minimum_spend_ghs,
  google_place_id, google_maps_url, lat, lng,
  phone_pending, phone_status, phone_source,
  business_status, place_rating, place_rating_count, places_synced_at,
  opening_periods, opening_hours_text, hours_synced_at
)
select
  'Game It Up',
  'activity',
  (select id from areas where lower(name) = 'atomic junction'),
  'budget',
  80,
  'Arcade floor at Atlantic Mall, Atomic Junction. Machines are paid for one game at a time, from GHS 10 for the basketball hoop up to GHS 150 for a two-seat go-kart, so an hour here costs whatever you choose to feed it.',
  array['fun', 'lively', 'casual'],
  array['friend_outing', 'first_date', 'date_night'],
  false, false, true,
  'per_person', 'menu', null,
  'ChIJJxKWpi2b3w8RkhfIe8jIAmE',
  'https://maps.google.com/?cid=6989127455066000274',
  5.6675625, -0.1784375,
  '+233 55 318 0665', 'pending', 'Google Places, unreviewed',
  'OPERATIONAL', 4.1, 107, now(),
  '[{"open":{"day":0,"hour":12,"minute":0},"close":{"day":0,"hour":21,"minute":0}},
    {"open":{"day":1,"hour":12,"minute":0},"close":{"day":1,"hour":21,"minute":0}},
    {"open":{"day":2,"hour":12,"minute":0},"close":{"day":2,"hour":21,"minute":0}},
    {"open":{"day":3,"hour":12,"minute":0},"close":{"day":3,"hour":21,"minute":0}},
    {"open":{"day":4,"hour":12,"minute":0},"close":{"day":4,"hour":21,"minute":0}},
    {"open":{"day":5,"hour":12,"minute":0},"close":{"day":5,"hour":21,"minute":0}},
    {"open":{"day":6,"hour":12,"minute":0},"close":{"day":6,"hour":21,"minute":0}}]'::jsonb,
  array[
    'Sunday: 12:00 PM - 9:00 PM','Monday: 12:00 PM - 9:00 PM','Tuesday: 12:00 PM - 9:00 PM',
    'Wednesday: 12:00 PM - 9:00 PM','Thursday: 12:00 PM - 9:00 PM','Friday: 12:00 PM - 9:00 PM',
    'Saturday: 12:00 PM - 9:00 PM'
  ],
  now()
where not exists (select 1 from venues where google_place_id = 'ChIJJxKWpi2b3w8RkhfIe8jIAmE');

-- ── Bliss: hours, contact and the arcade floor price ────────────────────
-- Closed every Monday. This is the case that started all of it.
update venues set
  opening_periods = '[{"open":{"day":0,"hour":10,"minute":0},"close":{"day":1,"hour":0,"minute":0}},
                      {"open":{"day":2,"hour":12,"minute":0},"close":{"day":3,"hour":0,"minute":0}},
                      {"open":{"day":3,"hour":12,"minute":0},"close":{"day":4,"hour":0,"minute":0}},
                      {"open":{"day":4,"hour":12,"minute":0},"close":{"day":5,"hour":0,"minute":0}},
                      {"open":{"day":5,"hour":12,"minute":0},"close":{"day":6,"hour":0,"minute":0}},
                      {"open":{"day":6,"hour":10,"minute":0},"close":{"day":0,"hour":0,"minute":0}}]'::jsonb,
  opening_hours_text = array[
    'Sunday: 10:00 AM - 12:00 AM','Monday: Closed','Tuesday: 12:00 PM - 12:00 AM',
    'Wednesday: 12:00 PM - 12:00 AM','Thursday: 12:00 PM - 12:00 AM',
    'Friday: 12:00 PM - 12:00 AM','Saturday: 10:00 AM - 12:00 AM'
  ],
  hours_synced_at = now(),
  -- Arcade play is sold only as a GHS 100 bag of ten tokens, and nothing else
  -- on the site costs less than 100 for one person either.
  minimum_spend_ghs = 100,
  avg_cost_per_person_ghs = 125,
  price_source = 'menu',
  business_status = 'OPERATIONAL',
  place_rating = 4.4,
  place_rating_count = 979,
  places_synced_at = now(),
  phone_pending = coalesce(phone, phone_pending, '+233 55 111 5500'),
  phone_status = case when phone is not null then phone_status else 'pending' end,
  phone_source = case when phone is not null then phone_source else 'Google Places, unreviewed' end,
  description = 'Bowling, a trampoline park, VR and an arcade floor at the Aviation Social Centre off Airport Bypass Road. Bowling is GHS 125 a game per person, arcade play is sold as a GHS 100 bag of ten tokens. Closed on Mondays.'
where google_place_id = 'ChIJZRZOZv2b3w8RmdCRpXWq7gQ';

-- ── Cypher Zone ─────────────────────────────────────────────────────────
update venues set
  opening_periods = '[{"open":{"day":0,"hour":10,"minute":0},"close":{"day":1,"hour":0,"minute":0}},
                      {"open":{"day":1,"hour":10,"minute":0},"close":{"day":1,"hour":22,"minute":0}},
                      {"open":{"day":2,"hour":10,"minute":0},"close":{"day":2,"hour":22,"minute":0}},
                      {"open":{"day":3,"hour":10,"minute":0},"close":{"day":3,"hour":22,"minute":0}},
                      {"open":{"day":4,"hour":10,"minute":0},"close":{"day":4,"hour":22,"minute":0}},
                      {"open":{"day":5,"hour":10,"minute":0},"close":{"day":5,"hour":22,"minute":0}},
                      {"open":{"day":6,"hour":10,"minute":0},"close":{"day":0,"hour":0,"minute":0}}]'::jsonb,
  opening_hours_text = array[
    'Sunday: 10:00 AM - 12:00 AM','Monday: 10:00 AM - 10:00 PM','Tuesday: 10:00 AM - 10:00 PM',
    'Wednesday: 10:00 AM - 10:00 PM','Thursday: 10:00 AM - 10:00 PM',
    'Friday: 10:00 AM - 10:00 PM','Saturday: 10:00 AM - 12:00 AM'
  ],
  hours_synced_at = now(),
  avg_cost_per_person_ghs = 120,
  price_source = 'menu',
  business_status = 'OPERATIONAL',
  place_rating = 4.5,
  place_rating_count = 217,
  places_synced_at = now(),
  phone_pending = coalesce(phone, phone_pending, '+233 53 102 5050'),
  phone_status = case when phone is not null then phone_status else 'pending' end,
  phone_source = case when phone is not null then phone_source else 'Google Places, unreviewed' end,
  description = 'Bowling, mini golf and laser tag on the upper floor of Palace Mall, Labone. Laser tag needs at least six players, so it is a group outing rather than something two people can book.'
where google_place_id = 'ChIJJzbs2tqb3w8RbImIv_3Wz2Y';

-- ── Price lists ─────────────────────────────────────────────────────────
-- Cleared first so running this twice does not double the catalogue. The
-- placeholder "Typical spend, per person" rows go with them, which is the
-- point: they were a guess wearing a menu price's clothes.
delete from menu_items
where venue_id in (
  select id from venues where google_place_id in (
    'ChIJJxKWpi2b3w8RkhfIe8jIAmE',
    'ChIJZRZOZv2b3w8RmdCRpXWq7gQ',
    'ChIJJzbs2tqb3w8RbImIv_3Wz2Y'
  )
);

insert into menu_items
  (venue_id, name, category, price_ghs, covers_people, min_players, max_players,
   duration_minutes, min_age, requires_gear, notes)
select v.id, x.name, 'activity'::menu_category, x.price, x.covers, x.min_p, x.max_p,
       x.mins, x.age, x.gear, x.notes
from venues v
join (values
  -- Game It Up. covers_people is the whole point here: the basketball machine
  -- is one player at GHS 10, the foosball table is GHS 30 for the table with
  -- two people at it. Billing both per head charges a couple double.
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Basketball Machine',      10::numeric, 1::smallint, null::smallint, null::smallint, null::smallint, null::smallint, null::text, 'Per game, 1 player'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Foosball Table',          30, 2, null, 2,    null, null, null, '3 rounds, 2 players. Price is for the table'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Air Hockey',              30, 2, null, 2,    null, null, null, '3 rounds, 2 players. Price is for the table'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Racing Simulator',        30, 1, null, null, null, null, null, 'Per game, 1 player'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Snocross Motor',          40, 1, null, null, null, null, null, '1 race. Finish first and the next game is free'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Punching Bag',            20, 1, null, null, null, null, null, 'Per game, 2 tries'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Hitbeans',                20, 2, null, 2,    null, null, null, 'Per game, 2 players'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Hammer King',             20, 1, null, null, null, null, null, 'Per game, 2 tries'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Crane Machine',           30, 1, null, null, null, null, null, 'Per game, 2 tries'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Mini Crane',              10, 1, null, null, null, null, null, 'Per game, 2 tries'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Big Doll Drop',           50, 1, null, null, null, null, null, 'Per game, 1 try'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Step Master',             30, 1, null, null, null, null, null, 'Per game, 1 player'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Aliens Shooting',         30, 1, null, null, null, null, null, 'Per player, 2 lives'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Operation G.H.O.S.T',     40, 1, null, null, null, null, null, 'Per player, 2 lives'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Jurassic Park',           50, 1, null, null, null, null, null, 'Per player, 3 lives'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'VR Motional',             50, 1, null, null, null, null, null, 'Per game, 1 player'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'VR Spaceship',            50, 1, null, null, null, null, null, 'Per game, 1 player'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Laser Tag',               70, 1, null, null, null, null, null, 'Per player, 1 session'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Laser Tag Bumper Cars',   50, 1, null, null, null, null, null, 'Per person'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Go-Karting, small car',   70, 1, null, null, null, null, null, 'Single seat, per person'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Go-Karting, big car',    100, 1, null, null, null, null, null, 'Single seat, per person'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Go-Karting, double seat',150, 2, null, 2,    null, null, null, 'Two seats, price is for the kart'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Shooting Range',          70, 1, null, null, null, null, null, '20 shots'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Inflatable Park',        130, 1, null, null, 60,   null, null, '1 hour per person'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Inflatable Park, adult and child', 180, 2, null, 2, 60, null, null, '1 hour. One adult and one child under 7'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Flash Grid',              50, 1, null, null, null, null, null, 'Per player'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Karaoke, one singer',     40, 1, null, 1,    null, null, null, '1 player, 1 song'),
  ('ChIJJxKWpi2b3w8RkhfIe8jIAmE', 'Karaoke, two singers',    80, 2, null, 2,    null, null, null, '2 players, 1 song'),

  -- Bliss. Everything here is per head except the token bag, which is also
  -- per head but bought once and spent across the arcade floor.
  ('ChIJZRZOZv2b3w8RmdCRpXWq7gQ', 'Bowling',                125, 1, null, null, null, null, null, 'Per head, per game'),
  ('ChIJZRZOZv2b3w8RmdCRpXWq7gQ', 'Mini-Bowling',           100, 1, null, null, null, null, null, 'Per head, per game'),
  ('ChIJZRZOZv2b3w8RmdCRpXWq7gQ', 'Arcade, bag of 10 tokens',100, 1, null, null, null, null, null, 'The smallest amount of arcade play you can buy'),
  ('ChIJZRZOZv2b3w8RmdCRpXWq7gQ', 'Arcade, extra token',     10, 1, null, null, null, null, null, 'On top of a bag, not sold on its own'),
  ('ChIJZRZOZv2b3w8RmdCRpXWq7gQ', 'Trampoline, under 12s',  125, 1, null, null, 60,   null, null, '1 hour, under 12 years'),
  ('ChIJZRZOZv2b3w8RmdCRpXWq7gQ', 'Trampoline, 12 and over',175, 1, null, null, 60,   12,   null, '1 hour, 12 years and over'),
  ('ChIJZRZOZv2b3w8RmdCRpXWq7gQ', 'VR Twin Battle',         100, 1, null, null, null, null, null, 'Listed as GHS 100. Confirm at the desk whether that is per player or for the pair'),

  -- Cypher Zone. Laser tag will not run below six players, so a couple is
  -- told no at the desk rather than sold a game.
  ('ChIJJzbs2tqb3w8RbImIv_3Wz2Y', 'Mini Golf',              100, 1, null, 4,    null, 6,    null, '9 courses, up to 4 players, 6 years and over'),
  ('ChIJJzbs2tqb3w8RbImIv_3Wz2Y', 'Bowling',                120, 1, null, 6,    null, 6,    'Socks and bowling shoes', 'Standard game of 10 rounds, up to 6 players'),
  ('ChIJJzbs2tqb3w8RbImIv_3Wz2Y', 'Laser Tag',              150, 1, 6,    24,   12,   7,    null, '12 minute game, 6 to 24 players, 7 years and over')
) as x(place_id, name, price, covers, min_p, max_p, mins, age, gear, notes)
  on v.google_place_id = x.place_id;

-- ── Deliberately not seeded ─────────────────────────────────────────────
-- Two lines on the Game It Up poster are cut off in the photograph and are not
-- guessed here. Add them in the admin once the figures are legible:
--   Archery Range, price partly cropped
--   Dance (Rhythm/Dance section), price not visible at all
