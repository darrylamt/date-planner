-- Labadi, for the venues that had nowhere to be.
--
-- 0043 placed seventeen of the thirty-six stranded venues and left nineteen,
-- six of which were beach clubs along the La shoreline sitting two to four and
-- a half kilometres from every neighbourhood centre in the catalogue. That is
-- not a weak match, it is the absence of the right answer: Labadi was not in
-- the areas table, so the nearest name was always going to be a wrong one.
--
-- Measured against the beach itself rather than against a centroid, because
-- the area has no venues yet and therefore no centre to average. Everything
-- moved here is within 2.2km of Labadi Beach and further from every other
-- centre we hold; Le Petit Oiseau and Gerry's sit closer to Labone and are
-- deliberately left where they are.
--
-- Tse Addo comes along: it is the neighbourhood immediately behind Labadi, the
-- venue says so in its own name, and it is 1.8km from the beach against 2.9km
-- from Labone.
--
-- areas holds no coordinates, by design. The centroid is averaged from the
-- venues filed under a name, so Labadi acquires its own centre the moment
-- these seven land in it, and improves as more are added.

insert into public.areas (name, city)
select 'Labadi', 'Accra'
where not exists (select 1 from public.areas where name = 'Labadi');

update public.venues v set area_id = (select id from public.areas where name = 'Labadi')
where v.name in (
  'Sandbox Beach Club',
  'Shornaa Island Amusement Park',
  'Polo Beach Club',
  'Hotdog Avenue - Tse Addo',
  'SI BEACH CLUB',
  'Laboma Beach Resort',
  'Alora Beach Resort'
)
  -- Only out of the districts, so a venue somebody has already placed by hand
  -- is never overruled.
  and v.area_id in (
    select id from public.areas where name in ('Kpeshie', 'Ayawaso', 'Laboma')
  );

-- Twelve venues still sit in a district. They are genuine judgement calls,
-- mostly within a few hundred metres of two centres at once, and /admin/areas
-- makes them a sitting's work rather than a venue at a time.
