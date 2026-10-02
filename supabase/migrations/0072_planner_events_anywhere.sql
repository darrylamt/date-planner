-- An event planner's night can be at any venue, not only one they made.
--
-- 0046 let a planner create a location and put events at it, on the model
-- of a pop-up with no fixed address. Many planners are the opposite: the
-- night is theirs and the venue changes, Recovery Saturdays at one club this
-- week and another the next, at places already in the catalogue. Making them
-- add each club again as their own "location" duplicated real venues and
-- split every one of them in two.
--
-- So an event records who created it, and a planner may write their own
-- events at any active venue. The venue rule from 0038 stays as it was, so a
-- venue still runs the events at its own place, including a planner's: the
-- two policies are permissive and either is enough.
--
-- ── what is checked ─────────────────────────────────────────────────────
-- Only an active planner (is_event_planner), only events they created, only
-- at a venue that exists and is active, and only filed under that venue's own
-- area, so a night cannot be put in a busier part of town than its address.

alter table public.events
  add column if not exists created_by uuid references auth.users (id) on delete set null;
-- Filled in by the database, so the portal never has to send it.
alter table public.events alter column created_by set default auth.uid();

comment on column public.events.created_by is
  'Who made this event: a planner may edit their own at any venue (0072). Null for events made by an admin or before 0072.';

create index if not exists events_created_by_idx on public.events (created_by) where created_by is not null;

/*
 * Security definer, like manages_venue, because the policy calls it while
 * deciding a write and must not depend on what the caller may read of venues
 * (0014 grants venues by column). It only answers yes or no.
 */
create or replace function public.event_venue_ok(v uuid, a uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.venues
    where id = v and is_active and area_id = a
  );
$$;

revoke execute on function public.event_venue_ok(uuid, uuid) from public;
grant execute on function public.event_venue_ok(uuid, uuid) to authenticated;

drop policy if exists "events: planner write own" on public.events;
create policy "events: planner write own" on public.events
  for all
  using (created_by = auth.uid() and public.is_event_planner())
  with check (
    created_by = auth.uid()
    and public.is_event_planner()
    and public.event_venue_ok(venue_id, area_id)
  );
