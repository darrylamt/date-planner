-- Link venues to Google Places.
--
-- The division of labour: Google holds the volatile public facts (is it open,
-- where exactly, what is the phone number today), and we hold the things only
-- we have, menus, prices, vibe tags, and the judgement about who a place
-- suits. place_id is the join between them.
--
-- The immediate reason is Brasa Accra, which was closed and sat in the catalog
-- as active because nothing ever re-checked it. business_status turns that
-- from something a person has to notice into something a nightly sweep sees.

alter table venues
  add column if not exists google_place_id text,
  add column if not exists business_status text,
  add column if not exists places_synced_at timestamptz,
  add column if not exists place_rating numeric(2,1),
  add column if not exists place_rating_count integer,
  add column if not exists price_level text;

comment on column venues.google_place_id is
  'Google Places identifier. Stable across name and address changes, so it is the join key rather than the name.';
comment on column venues.business_status is
  'OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY | FUTURE_OPENING, from the last Places sync.';
comment on column venues.price_level is
  'Google price bucket (PRICE_LEVEL_*). Maps to price_band. Never a substitute for a per-person figure, a bucket cannot produce the exact totals plans are built on.';

-- One venue per place. A duplicate link means two rows for one restaurant,
-- which the planner would happily put in the same evening twice.
create unique index if not exists venues_google_place_id_idx
  on venues (google_place_id)
  where google_place_id is not null;

-- The closure sweep walks these in order of least-recently-checked.
create index if not exists venues_places_synced_idx
  on venues (places_synced_at nulls first)
  where google_place_id is not null;
