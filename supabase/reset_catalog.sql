-- aduro — clear the placeholder catalog before loading real data.
--
-- The original seed.sql invented 25 venues ("Chalé Bites", "Highlife House",
-- "Asa Rooftop"…) with placeholder prices. None of them are real businesses,
-- so every plan built on them was fiction. This removes them.
--
-- KEPT: the 8 areas. Achimota, Airport Residential, Cantonments, Dzorwulu,
-- East Legon, Labone, Osu and Spintex are real Accra neighbourhoods, and
-- venues/events reference them by id — dropping them would orphan the
-- taxonomy you are about to import against.
--
-- Run in the Supabase SQL editor. Wrapped in a transaction: if any statement
-- fails, nothing is deleted.

begin;

-- What is here before (read the NOTICEs in the output).
do $$
begin
  raise notice 'BEFORE  areas=%  venues=%  menu_items=%  events=%  plans=%  reservations=%',
    (select count(*) from public.areas),
    (select count(*) from public.venues),
    (select count(*) from public.menu_items),
    (select count(*) from public.events),
    (select count(*) from public.plans),
    (select count(*) from public.reservation_requests);
end $$;

-- Order matters. events.area_id is ON DELETE RESTRICT, so events must go
-- before anything touching areas; menu_items cascade from venues, and
-- reservation_requests.venue_id is ON DELETE SET NULL (which would silently
-- leave orphan rows pointing at nothing), so clear them explicitly.
delete from public.events;
delete from public.reservation_requests;

-- Saved plans embed a full itinerary as JSON — copies of the fake venues,
-- frozen at save time. They cannot be repaired by reimporting, so they go too.
delete from public.plans;

-- Cascades to menu_items via menu_items_venue_id_fkey.
delete from public.venues;

do $$
begin
  raise notice 'AFTER   areas=%  venues=%  menu_items=%  events=%  plans=%  reservations=%',
    (select count(*) from public.areas),
    (select count(*) from public.venues),
    (select count(*) from public.menu_items),
    (select count(*) from public.events),
    (select count(*) from public.plans),
    (select count(*) from public.reservation_requests);
end $$;

commit;

-- Expected after: areas=8, everything else 0.
--
-- Next: load real venues at /admin/import (venues first, then menu items —
-- the menu importer matches venues by exact name). Templates live in
-- supabase/templates/.
