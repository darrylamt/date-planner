-- A Featured slot can be for an event at the venue (owner, 5 Nov 2026:
-- "its supposed to be friday night footy"). With event_id set, the Home card
-- shows the event's title and poster; the tap still opens the venue. Null is
-- a featured place, as before. No new table, so audit:smoke is unchanged.
alter table public.featured_venues
  add column if not exists event_id uuid references public.events (id) on delete set null;

update public.featured_venues
  set event_id = '6ad34846-d674-41af-9f12-dc6f61e52145'
  where venue_id = '83aac3f1-dae8-4ed8-a02e-64922d5ab949' and ends_on >= '2026-11-05';
