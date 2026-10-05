-- Local or continental.
--
-- Accra eats two ways and the catalogue could not tell them apart. A chop bar
-- and a Mediterranean place both come out as type = 'restaurant', so someone
-- who wants waakye and someone who wants pasta were handed the same shortlist
-- and the difference was left to luck.
--
-- Three values rather than two, because plenty of kitchens genuinely do both,
-- and forcing those into one camp would make the answer wrong half the time.
--
-- Null is the important one: it means nobody has recorded it, which is not the
-- same as "both" and must never be read as either. The planner treats an
-- unrecorded venue as allowed but unpreferred, exactly as it treats a venue
-- with no opening hours, because reading "we do not know" as "no" would empty
-- the shortlist on the day this ships, when every row is null.

alter table venues
  add column if not exists cuisine text;

comment on column venues.cuisine is
  'local: Ghanaian and West African cooking, chop bars included. continental: European, Asian, American, anything else. both: a kitchen that genuinely serves either. Null means nobody has recorded it, which is NOT the same as both.';

alter table venues drop constraint if exists venues_cuisine_known;
alter table venues
  add constraint venues_cuisine_known check (
    cuisine is null or cuisine in ('local', 'continental', 'both')
  );

-- Every migration that adds a venues column has to grant it. 0013 and 0014
-- turned the venue grant into an explicit list, 0015 forgot, and plan
-- generation was down until 0017 put it back.
grant select (cuisine) on public.venues to anon;
grant select (cuisine) on public.venues to authenticated;

-- Deliberately not backfilled. Guessing a kitchen's cuisine from its name
-- would fill fifty rows with confident-looking assumptions that nobody would
-- ever re-check, and the whole point of the column is to stop sending someone
-- who asked for waakye to a pasta place. The admin's Menus screen lists what
-- is still unrecorded.
