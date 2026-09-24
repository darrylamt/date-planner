-- Move the spas into the type 0055 made for them.
--
-- RUN 0055 FIRST, AND SEPARATELY. This uses 'wellness', which only exists
-- once 0055 has committed.
--
-- Named one by one rather than matched on '%spa%', because the pattern also
-- matches "The Conclave Meetings & Events Space". Pilates is not here: it is
-- a class rather than a treatment, and whether it belongs is a call for a
-- person, not a pattern.
update public.venues
   set type = 'wellness'
 where name in (
   'KaYen Spa',
   'Oasis Massage & Spa',
   'Resense Spa - Kempinski Hotel Gold Coast City',
   'Signature Spa',
   'The Honeypot Spa'
 );

/*
 * A spa's price list is treatments, not a flat entry fee. "other" is the
 * bucket the planner reads as one charge at the door, which a massage menu
 * is not. Already corrected by hand for the two that had it; kept here so a
 * rebuilt database arrives the same way.
 */
update public.menu_items
   set category = 'activity'
 where category = 'other'
   and venue_id in (select id from public.venues where type = 'wellness');

-- Say how many moved, so a renamed spa shows up as a four instead of a five.
do $$
declare n integer;
begin
  select count(*) into n from public.venues where type = 'wellness';
  raise notice 'wellness venues: % (expected 5)', n;
end $$;
