-- Prices that only apply at certain hours, and Aura Lifestyle Club.
--
-- Aura's padel poster is two prices for the same court:
--   6am to 4pm   GHS 300 for a 60 minute slot
--   4pm to 10pm  GHS 600 for a 90 minute slot
--
-- Nothing in the catalogue could hold that. A venue has one unit price, and an
-- activity line has one price, so the choices were to store the cheap one and
-- under-quote every evening booking by half, or store the dear one and price
-- an afternoon at double. Both are the same failure: a number in the plan that
-- the venue will not honour.
--
-- Two columns fix it, and they generalise past padel. A happy hour, a lunch
-- menu, a matinee rate and an after-midnight cover are all the same shape:
-- this line is only on sale between these hours.
--
-- Checked against Places while writing this: Aura is open 06:00 to 22:00 every
-- day, which is exactly the span the two price bands cover between them. The
-- poster and the opening hours corroborate each other.

alter table menu_items
  add column if not exists available_from_minute smallint,
  add column if not exists available_to_minute smallint;

comment on column menu_items.available_from_minute is
  'Minutes from midnight when this price starts applying. 360 is 06:00. Null means all day.';
comment on column menu_items.available_to_minute is
  'Minutes from midnight when it stops. 960 is 16:00, and the window is treated as [from, to), so a 16:00 booking gets the peak price rather than the off-peak one. Null means all day.';

alter table menu_items drop constraint if exists menu_items_window_sane;
alter table menu_items
  add constraint menu_items_window_sane check (
    (available_from_minute is null or available_from_minute between 0 and 1440)
    and (available_to_minute is null or available_to_minute between 0 and 1440)
  );

-- ── Aura Lifestyle Club ─────────────────────────────────────────────────
-- Osu. Confirmed by what stands around it rather than by Google's own
-- component, which says "Kpeshie" as it does for half the city: Osu La
-- Crescent, First Osu Lane and Labone Junction are all within 300 metres, and
-- the coordinates sit 310m from the middle of the venues already filed in Osu.
insert into venues (
  name, type, area_id, price_band, avg_cost_per_person_ghs, description,
  vibe_tags, best_for, reservation_required, is_free, is_active,
  pricing_mode, price_source, min_party_size, max_party_size,
  google_place_id, google_maps_url, lat, lng,
  business_status, place_rating, place_rating_count, places_synced_at,
  opening_periods, opening_hours_text, hours_synced_at
)
select
  'Aura Lifestyle Club',
  'activity',
  (select id from areas where lower(name) = 'osu'),
  'mid',
  -- A peak court is GHS 600 for four, which is what a padel booking normally
  -- is. Per head that is 150, and this figure is only a backstop anyway: the
  -- two court lines below are what the planner actually prices from.
  150,
  'Padel courts off Anorhor Street in Osu. The court is booked as a court, not per player, so the price is the same whether two of you turn up or four. Afternoons are cheaper and shorter: GHS 300 buys an hour before 4pm, GHS 600 buys ninety minutes after it.',
  array['fun', 'lively', 'adventurous'],
  array['friend_outing', 'date_night'],
  -- A court has to be booked. Turning up to play padel is not a thing.
  true, false, true,
  'per_person', 'menu',
  -- Padel takes two at the very least, so a solo day never gets offered one.
  2, 4,
  'ChIJR4PBfgCR3w8RiSJ_dlHXTp8',
  'https://www.google.com/maps/place/?q=place_id:ChIJR4PBfgCR3w8RiSJ_dlHXTp8',
  5.5614848, -0.1747657,
  'OPERATIONAL', 4.8, 17, now(),
  '[{"open":{"day":0,"hour":6,"minute":0},"close":{"day":0,"hour":22,"minute":0}},
    {"open":{"day":1,"hour":6,"minute":0},"close":{"day":1,"hour":22,"minute":0}},
    {"open":{"day":2,"hour":6,"minute":0},"close":{"day":2,"hour":22,"minute":0}},
    {"open":{"day":3,"hour":6,"minute":0},"close":{"day":3,"hour":22,"minute":0}},
    {"open":{"day":4,"hour":6,"minute":0},"close":{"day":4,"hour":22,"minute":0}},
    {"open":{"day":5,"hour":6,"minute":0},"close":{"day":5,"hour":22,"minute":0}},
    {"open":{"day":6,"hour":6,"minute":0},"close":{"day":6,"hour":22,"minute":0}}]'::jsonb,
  array[
    'Sunday: 6:00 AM - 10:00 PM','Monday: 6:00 AM - 10:00 PM','Tuesday: 6:00 AM - 10:00 PM',
    'Wednesday: 6:00 AM - 10:00 PM','Thursday: 6:00 AM - 10:00 PM',
    'Friday: 6:00 AM - 10:00 PM','Saturday: 6:00 AM - 10:00 PM'
  ],
  now()
where not exists (select 1 from venues where google_place_id = 'ChIJR4PBfgCR3w8RiSJ_dlHXTp8');

delete from menu_items
where venue_id in (select id from venues where google_place_id = 'ChIJR4PBfgCR3w8RiSJ_dlHXTp8');

-- covers_people is 4 because the price buys the court. Two people playing
-- singles pay the same GHS 600 as four playing doubles, so charging per head
-- would quote a couple 1,200 for a 600 cedi booking.
insert into menu_items
  (venue_id, name, category, price_ghs, covers_people, min_players, max_players,
   duration_minutes, available_from_minute, available_to_minute, notes)
select v.id, x.name, 'activity'::menu_category, x.price, x.covers, x.min_p, x.max_p,
       x.mins, x.from_min, x.to_min, x.notes
from venues v
join (values
  ('Padel court, off-peak', 300::numeric, 4::smallint, 2::smallint, 4::smallint,
   60::smallint, 360::smallint, 960::smallint,
   '60 minute slot, 6am to 4pm. Price is for the court'),
  ('Padel court, peak', 600, 4, 2, 4,
   90, 960, 1320,
   '90 minute slot, 4pm to 10pm. Price is for the court')
) as x(name, price, covers, min_p, max_p, mins, from_min, to_min, notes)
  on v.google_place_id = 'ChIJR4PBfgCR3w8RiSJ_dlHXTp8';
