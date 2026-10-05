-- An event planner's logo, and who is behind an event.
--
-- A planner's night shows up in somebody's plan as an event card, and the card
-- said what and where but never who. Planners asked to put their logo on it:
-- a recognisable mark is half of why people go to a night they have been to
-- before.
--
-- ── where it lives ──────────────────────────────────────────────────────
-- The logo belongs to the planner, so it is kept on event_planners. The card
-- is drawn from the event, and events are already public and already read
-- whole by the planner, so each event also carries the organiser's name and
-- logo, copied from the planner when either is set and when an event is
-- saved. That is one column more per event than a join, and it means no new
-- read access to event_planners for anybody, and nothing changes for builds
-- that do not know the columns: they simply never read them.

alter table public.event_planners add column if not exists logo_url text;

comment on column public.event_planners.logo_url is
  'The planner''s logo, a public URL in the images bucket. Copied onto their events as organiser_logo_url.';

-- A planner may change their own logo and nothing else on their row: the
-- username, the name on their posters and the kill switch stay the admin's.
drop policy if exists "planners: update own logo" on public.event_planners;
create policy "planners: update own logo" on public.event_planners
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke update on public.event_planners from authenticated;
grant update (logo_url) on public.event_planners to authenticated;

alter table public.events add column if not exists organiser_name text;
alter table public.events add column if not exists organiser_logo_url text;

comment on column public.events.organiser_name is
  'Who is running the night, as it appears on their posters. Set from event_planners for a planner''s events.';
comment on column public.events.organiser_logo_url is
  'Their logo, shown on the event''s card in a plan. Set from event_planners.logo_url.';
