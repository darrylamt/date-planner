-- Genuinely-free venues, and the indexes the admin triage screens need.
--
-- A stop can only total zero when the venue is actually free to enter. Until
-- now "costs nothing" and "we have no idea what it costs" were the same state
-- (avg_cost_per_person_ghs = 0), which is how unpriced rooftop bars ended up
-- being planned as free evenings. The planner withholds anything unpriced, so
-- without this flag a park could never appear in a plan at all.

alter table venues
  add column if not exists is_free boolean not null default false;

comment on column venues.is_free is
  'Entry genuinely costs nothing (park, beach, free gallery). Distinct from an unpriced venue, which is withheld from plans rather than shown as free.';

-- A venue cannot be both free and carry a per-person figure; the two
-- contradict each other and the planner would have to pick one.
alter table venues
  drop constraint if exists venues_free_has_no_cost;

alter table venues
  add constraint venues_free_has_no_cost
  check (not is_free or avg_cost_per_person_ghs = 0);

-- The admin dashboard counts these on every load.
create index if not exists venues_verification_status_idx
  on venues (verification_status)
  where is_active;

create index if not exists venues_active_idx
  on venues (is_active);

create index if not exists menu_items_venue_idx
  on menu_items (venue_id);
