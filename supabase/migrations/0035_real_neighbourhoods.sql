-- Areas people actually name, instead of the ones Google returns.
--
-- Five of the twenty-four areas are not neighbourhoods. Kpeshie, Osu Klottey
-- and Ayawaso are sub-metropolitan districts: Kpeshie contains Labone,
-- Cantonments and Burma Camp; Osu Klottey contains Osu. Laboma is a beach in
-- the La stretch, and its venue centroid sits 385 metres from Labone's.
-- La-Nkwantanang-Madina is the municipal name for what everybody calls Madina.
--
-- Nobody in Accra says "meet me in Kpeshie", and fifty-eight venues, a third
-- of the catalogue, were filed under one of these.
--
-- ── what is safe to move, and what is not ───────────────────────────────
-- Two of the five map onto one neighbourhood each and can be merged outright:
-- Osu Klottey is the Osu district, and La-Nkwantanang-Madina is Madina.
--
-- The other three genuinely span several. Reassigning them by nearest centroid
-- was tried and abandoned: with one or two venues in a target area its centre
-- is a single point, and the geometry put "vida e caffè - Cantonments" in
-- North Ridge and The Yam-Bar in Madina, two kilometres away. A blanket
-- default per district is no better, and would have filed the Kwame Nkrumah
-- Memorial Park in Labone and Chocolate Sarayi at Accra Mall alongside it.
--
-- So only what can be checked moves here. Nine venues name their own
-- neighbourhood and are taken at their word; the rest of Kpeshie, Ayawaso and
-- Laboma are left where they are for a person to place, which /admin/areas now
-- makes a sitting's work rather than a venue at a time.
--
-- The blocklist in areas.ts is the other half: these names got in because
-- ensureAreaId creates whatever Google hands it, and without that guard they
-- would be back by the next sync.

-- ── 1. The two districts that are one neighbourhood each ────────────────
update public.venues v set area_id = (select id from public.areas where name = 'Osu')
where v.area_id = (select id from public.areas where name = 'Osu Klottey');

update public.venues v set area_id = (select id from public.areas where name = 'Madina')
where v.area_id = (select id from public.areas where name = 'La-Nkwantanang-Madina');

update public.events e set area_id = (select id from public.areas where name = 'Osu')
where e.area_id = (select id from public.areas where name = 'Osu Klottey');

update public.events e set area_id = (select id from public.areas where name = 'Madina')
where e.area_id = (select id from public.areas where name = 'La-Nkwantanang-Madina');

-- ── 2. Venues that say where they are in their own name ─────────────────
-- A branch is usually named after its neighbourhood, which is the venue
-- telling us directly rather than us inferring it from other venues' averages.
update public.venues v set area_id = a.id
from (values
  ('Chocolate Sarayi - East Legon',  'East Legon'),
  ('Korea House Ninano - East Legon', 'East Legon'),
  ('Korea House Ninano - Osu',        'Osu'),
  ('North Ridge Cafe & Bistro',       'North Ridge'),
  ('Snowman - Airport Residential',   'Airport Residential'),
  ('Snowman - East Legon',            'East Legon'),
  ('Snowman - Osu',                   'Osu'),
  ('The Cupcake Boutique (Labone)',   'Labone'),
  ('vida e caffè - Cantonments',      'Cantonments')
) as x(venue_name, area_name)
join public.areas a on a.name = x.area_name
where v.name = x.venue_name;

-- ── 3. Retire the two that are now empty ────────────────────────────────
-- Guarded rather than assumed: venues.area_id is ON DELETE RESTRICT, so a
-- stray row would fail this migration outright rather than be orphaned, and
-- the guard turns that into a no-op worth investigating instead.
delete from public.areas a
where a.name in ('Osu Klottey', 'La-Nkwantanang-Madina')
  and not exists (select 1 from public.venues v where v.area_id = a.id)
  and not exists (select 1 from public.events e where e.area_id = a.id);

-- Kpeshie, Ayawaso and Laboma deliberately survive. They still hold venues
-- nobody has placed yet, and deleting an area with venues in it is not
-- something a migration should be deciding.
