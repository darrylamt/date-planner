-- How many people a venue actually works for.
--
-- Padel is the case that surfaced it: a court needs two for singles or four
-- for doubles, and one person cannot play at all. Escape rooms have minimums,
-- small dining rooms have maximums, and until now the planner knew none of
-- this — it would happily send a solo day to a padel court, or a group of
-- eight somewhere that seats four.
--
-- Deliberately a range rather than a list of exact playable counts. Padel is
-- really "2 or 4", not "2 to 4", but a group of three at a padel club is a
-- mildly awkward evening, whereas one person there is a wasted journey. The
-- range catches the failure that matters and stays a field someone can fill in
-- without thinking hard.

alter table venues
  add column if not exists min_party_size integer not null default 1,
  add column if not exists max_party_size integer;

comment on column venues.min_party_size is
  'Fewest people this venue works for. 2 for a padel court, higher for anything sold as a group booking.';
comment on column venues.max_party_size is
  'Most people it works for, or null for no practical limit. 4 for a padel court, a table size for a small dining room.';

alter table venues
  drop constraint if exists venues_party_range_sane;

alter table venues
  add constraint venues_party_range_sane
  check (
    min_party_size >= 1
    and (max_party_size is null or max_party_size >= min_party_size)
  );
