-- How people respond to a venue once Duro shows it to them, for the venue
-- portal's Insights (src/app/venue/insights), and Portal Pro, which unlocks
-- the detail.
--
-- From plan_signals (0089, 0093), counted, never listed: no device, account
-- or time of day ever leaves this function, only totals for the venue and
-- its area. Repeats are counted once per phone per day per kind, so one
-- person opening a menu ten times is one opening.
--
-- Free, every venue sees: times shown in a plan, kept, swapped out.
-- Pro adds: keep rate against the area's, menu opens, Book and Get there
-- taps, page visits and time spent, the dishes people add and the ones
-- they take off. Checked here, not in the page, so a venue without Pro is
-- never sent the numbers at all.
--
-- venue_pro is set by an admin (/admin/venue-logins) until there is a way to
-- pay in the portal: a row per venue, with the day it runs until.

create table if not exists public.venue_pro (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  until date not null,
  note text check (note is null or char_length(note) <= 200),
  updated_at timestamptz not null default now()
);
alter table public.venue_pro enable row level security;
revoke all on public.venue_pro from anon, authenticated;

create or replace function public.venue_response(p_venue uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  my_area uuid;
  pro_until date;
  is_pro boolean;
  out jsonb;
begin
  if not (public.manages_venue(p_venue) or public.is_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select area_id into my_area from public.venues where id = p_venue;
  select until into pro_until from public.venue_pro where venue_id = p_venue;
  is_pro := pro_until is not null and pro_until >= current_date;

  with s as (
    -- Once per phone, per day, per kind, per dish.
    select distinct p.venue_id, p.kind, p.device_id, p.created_at::date as day, p.item, p.value
    from public.plan_signals p
    where p.created_at >= since
      and (p.venue_id = p_venue or p.venue_id in (select id from public.venues where area_id = my_area))
  ),
  mine as (select * from s where venue_id = p_venue),
  kept_kinds as (select unnest(array['saved', 'shared', 'book_tapped', 'directions_tapped']) as kind)
  select jsonb_build_object(
    'pro', is_pro,
    'pro_until', pro_until,
    'shown', (select count(*) from mine where kind = 'shown'),
    'kept', (select count(*) from mine where kind in (select kind from kept_kinds)),
    'swapped', (select count(*) from mine where kind = 'swapped_away'),
    'detail', case when not is_pro then null else jsonb_build_object(
      'menu_opened', (select count(*) from mine where kind = 'menu_opened'),
      'details_opened', (select count(*) from mine where kind = 'details_opened'),
      'book_tapped', (select count(*) from mine where kind = 'book_tapped'),
      'directions_tapped', (select count(*) from mine where kind = 'directions_tapped'),
      'saved', (select count(*) from mine where kind in ('saved', 'shared')),
      'views', (select count(*) from mine where kind = 'venue_viewed'),
      'dwell_ms', (select percentile_cont(0.5) within group (order by value) from mine where kind = 'venue_viewed' and value is not null),
      -- Kept out of kept-or-swapped, for the area's other venues together.
      'area_kept', (select count(*) from s where venue_id <> p_venue and kind in (select kind from kept_kinds)),
      'area_swapped', (select count(*) from s where venue_id <> p_venue and kind = 'swapped_away'),
      'dishes_added', coalesce((
        select jsonb_agg(jsonb_build_object('item', item, 'n', n) order by n desc) from (
          select item, count(*) as n from mine where kind = 'dish_added' and item is not null
          group by item order by n desc limit 8
        ) t), '[]'::jsonb),
      'dishes_removed', coalesce((
        select jsonb_agg(jsonb_build_object('item', item, 'n', n) order by n desc) from (
          select item, count(*) as n from mine where kind = 'dish_removed' and item is not null
          group by item order by n desc limit 8
        ) t), '[]'::jsonb)
    ) end
  ) into out;
  return out;
end;
$$;

revoke all on function public.venue_response(uuid, integer) from public, anon;
grant execute on function public.venue_response(uuid, integer) to authenticated;
