-- Group outings: the organiser may offer chosen days, not only a range.
--
-- "Friday or Saturday", or "any Saturday this month", is how people actually
-- plan, and a range made them offer every day in between. day_options, when
-- set, is the whole list of days people answer for; date_from and date_to
-- become its first and last day. Null keeps the range, as before.
--
-- The range check widens to two months so chosen days can be spread out; a
-- range itself is still capped at two weeks by the API.

alter table public.groups
  add column if not exists day_options date[]
  check (day_options is null or (cardinality(day_options) between 1 and 10));

alter table public.groups drop constraint if exists groups_check;
alter table public.groups
  add constraint groups_dates_check check (date_to >= date_from and date_to - date_from <= 62);

comment on column public.groups.day_options is
  'Chosen days people answer for, when the organiser picked days rather than a range. Null: every day from date_from to date_to. See migration 0084.';
