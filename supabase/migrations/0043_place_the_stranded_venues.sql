-- Seventeen venues moved out of a district and into a neighbourhood.
--
-- 0035 merged the two districts that map cleanly onto one neighbourhood each
-- and deliberately left Kpeshie, Ayawaso and Laboma alone, because each spans
-- several and reassigning by nearest centroid had already been tried and
-- abandoned: with one or two venues in a target area its "centre" is a single
-- address, and the geometry put vida e caffè - Cantonments in North Ridge.
--
-- The catalogue has since filled out, so the same method now has something to
-- work with. Two guards make it honest this time:
--
--   1. Centroids were built only from venues somebody had already placed in a
--      real neighbourhood, and only where at least three of them agree. A
--      neighbourhood defined by one venue is a point, and matching against it
--      is matching against an address.
--
--   2. A venue moves only where the nearest centre is under 1.5km AND more
--      than 1.6 times closer than the runner-up. Accra's neighbourhoods abut,
--      so a venue 900 metres from two centres has not been identified.
--
-- Seventeen of thirty-six cleared both. The other nineteen are left where they
-- are for a person, which is the same call 0035 made and for the same reason.
--
-- Matched on name, so a renamed venue is skipped rather than mis-filed, and
-- only from the three districts, so a venue somebody has already placed by
-- hand is never overruled by arithmetic.

update public.venues v set area_id = a.id
from (values
  ('Arirang restaurant Korean Dining', 'Cantonments'),
  ('BABEL RESTAURANT GHANA',           'Labone'),
  ('Binkabi Restaurant',               'Labone'),
  ('Bosphorus Restaurant & Cafe',      'Labone'),
  ('Brown Sugar Lounge and Restaurant','Labone'),
  ('Chocolate Sarayı',                 'Osu'),
  ('Level Bar & Lounge',               'Osu'),
  ('Moka''s Resto Cafe',               'Labone'),
  ('OX ULTRA LOUNGE',                  'Osu'),
  ('Pit Stop',                         'Cantonments'),
  ('Shuko Bar & Lounge',               'Labone'),
  ('Sub Box',                          'Labone'),
  ('The Good Baker',                   'East Legon'),
  ('Venus Lounge Bar and Grill',       'Osu'),
  ('YAYA La Parisienne',               'Labone'),
  ('Zen Garden',                       'Labone'),
  ('manpuku ramen bar',                'Dzorwulu')
) as x(venue_name, area_name)
join public.areas a on a.name = x.area_name
where v.name = x.venue_name
  and v.area_id in (
    select id from public.areas where name in ('Kpeshie', 'Ayawaso', 'Laboma')
  );

-- Kpeshie, Ayawaso and Laboma survive again. They still hold nineteen venues
-- nobody has placed, six of which are beach clubs along the La shoreline with
-- no neighbourhood in the catalogue to belong to: they are two to four and a
-- half kilometres from every centre we hold, which is not a bad match, it is
-- the absence of the right answer. That wants a new area rather than a nearer
-- wrong one.
