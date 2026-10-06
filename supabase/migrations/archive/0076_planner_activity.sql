-- What event planners do in their portal, for the admin to read.
--
-- Planners publish straight to the catalogue with no approval step: a night
-- they put on is in people's plans the moment it is saved, and a place they
-- add is a venue. That trust is only reasonable if somebody can see what was
-- done with it, so every change a planner makes is written down here.
--
-- ── how rows get here ──────────────────────────────────────────────────
-- Events and venues: a trigger, on any insert, update or delete made by a
-- signed-in, active planner. The portal writes events on the planner's own
-- session, so the trigger sees who they are, and it catches every route to
-- the table, not only the ones somebody remembered to log.
--
-- Everything that goes through the service role (a place added through
-- /api/planner/place, a new part of town, a logo, a visit) is written by the
-- server itself: auth.uid() is null there, so a trigger could not say who.
--
-- ── who can see it ─────────────────────────────────────────────────────
-- Admins read it. Nobody writes it directly: the trigger is security
-- definer and the server uses the service role, so there is no insert
-- policy and a planner cannot add, change or remove their own history.

create table if not exists public.planner_activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  -- event.create, event.update, event.delete, place.create, place.update,
  -- place.delete, area.create, logo.update, logo.remove, visit
  action text not null,
  entity_id uuid,
  summary text not null,
  -- On an update: { column: [before, after] } for each column that changed.
  changes jsonb
);

create index if not exists planner_activity_at_idx on public.planner_activity (at desc);
create index if not exists planner_activity_user_idx on public.planner_activity (user_id, at desc);

alter table public.planner_activity enable row level security;

drop policy if exists "planner activity: admins read" on public.planner_activity;
create policy "planner activity: admins read" on public.planner_activity
  for select using (public.is_admin());

comment on table public.planner_activity is
  'Every change an event planner makes in their portal, and their visits. Read by admins; written only by triggers and the server.';

/*
 * One function for both tables. The summary is the row's own name: an
 * event's title and date, a venue's name. On an update only the columns
 * that actually changed are kept, before and after.
 */
create or replace function public.log_planner_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who uuid := auth.uid();
  row_now jsonb;
  row_was jsonb;
  diff jsonb := '{}'::jsonb;
  k text;
  noun text := case tg_table_name when 'events' then 'event' else 'place' end;
  label text;
begin
  if who is null or not public.is_event_planner() then
    return coalesce(new, old);
  end if;

  row_now := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_was := case when tg_op = 'INSERT' then null else to_jsonb(old) end;

  label := coalesce(row_now, row_was) ->> (case tg_table_name when 'events' then 'title' else 'name' end);
  if tg_table_name = 'events' then
    label := label || ' · ' || to_char((coalesce(row_now, row_was) ->> 'event_date')::date, 'Dy DD Mon YYYY');
  end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(row_now) loop
      if row_now -> k is distinct from row_was -> k then
        diff := diff || jsonb_build_object(k, jsonb_build_array(row_was -> k, row_now -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then
      return new;
    end if;
  end if;

  insert into public.planner_activity (user_id, action, entity_id, summary, changes)
  values (
    who,
    noun || '.' || case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
    ((coalesce(row_now, row_was)) ->> 'id')::uuid,
    coalesce(label, '(no name)'),
    case when tg_op = 'UPDATE' then diff else null end
  );
  return coalesce(new, old);
end;
$$;

revoke execute on function public.log_planner_change() from public;
revoke execute on function public.log_planner_change() from anon, authenticated;

drop trigger if exists events_planner_activity on public.events;
create trigger events_planner_activity
  after insert or update or delete on public.events
  for each row execute function public.log_planner_change();

drop trigger if exists venues_planner_activity on public.venues;
create trigger venues_planner_activity
  after insert or update or delete on public.venues
  for each row execute function public.log_planner_change();
