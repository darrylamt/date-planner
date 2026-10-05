-- How nice a place actually looks.
--
-- Everything the catalog knows about a venue so far is factual: what it costs,
-- where it is, whether it is open. None of that separates a beautiful rooftop
-- from a room with good food and flies over the table, and for an anniversary
-- that difference matters more than the price does.
--
-- One to five, set by whoever catalogued the place and correctable by the
-- people who went. Null means nobody has judged it yet, which is different
-- from average: an unrated venue is not penalised, it simply does not get the
-- lift a lovely one does.

alter table public.venues
  add column if not exists aesthetics smallint;

alter table public.venues
  drop constraint if exists venues_aesthetics_range;

alter table public.venues
  add constraint venues_aesthetics_range
  check (aesthetics is null or aesthetics between 1 and 5);

comment on column public.venues.aesthetics is
  '1 to 5 on how the place looks and feels. 5 is somewhere worth photographing, 1 is somewhere the food has to carry alone. Null means unjudged, which is not the same as average.';

-- Reports can now carry a rating, so the people who were actually there can
-- disagree with whoever catalogued it.
alter table public.venue_reports
  add column if not exists rating smallint;

alter table public.venue_reports
  drop constraint if exists venue_reports_rating_range;

alter table public.venue_reports
  add constraint venue_reports_rating_range
  check (rating is null or rating between 1 and 5);

comment on column public.venue_reports.rating is
  'Stars out of 5 from someone who went, for an aesthetics report. Null for every other kind.';

alter table public.venue_reports
  drop constraint if exists venue_reports_report_type_check;

alter table public.venue_reports
  add constraint venue_reports_report_type_check
  check (report_type in ('price', 'closed', 'phone', 'wrong_info', 'aesthetics', 'other'));
