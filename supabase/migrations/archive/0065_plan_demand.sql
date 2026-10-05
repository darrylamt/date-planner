-- Where people plan, and what for, without anybody in it.
--
-- One row per plan request: what was asked (occasion, party size, budget
-- band, day and hour, the areas chosen or a rough square for "near me"),
-- whether we could build it, and which venues the plan used. No user id, no
-- account, no exact position: "near me" is kept as a square about 1.1 km on a
-- side, the precise point is dropped before the row is written. That is the
-- difference between knowing East Legon has more demand than venues, which
-- this is for, and knowing where a named person was, which it must never be.
--
-- Written only by the server (service role) when a plan is generated. Nobody
-- reads the table directly: admins go through the service role, and a venue
-- sees its own numbers through venue_insights(), which checks that the caller
-- manages that venue and only ever returns counts.

create table if not exists public.plan_demand (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  plan_date text,
  weekday smallint check (weekday between 0 and 6),
  start_minute integer,
  source text not null check (source in ('areas', 'near', 'anywhere')),
  city text,
  area_ids uuid[] not null default '{}',
  -- "Near me" only: the square the point fell in, rounded to 0.01 degrees.
  cell_lat numeric(5, 2),
  cell_lng numeric(5, 2),
  radius_km numeric(4, 1),
  occasion text,
  party_size integer,
  budget_band text,
  focuses text[] not null default '{}',
  vibes text[] not null default '{}',
  cuisines text[] not null default '{}',
  outcome text not null check (outcome in ('ok', 'no_match')),
  no_match_reason text,
  venue_ids uuid[] not null default '{}'
);

create index if not exists plan_demand_created_idx on public.plan_demand (created_at desc);
create index if not exists plan_demand_venues_idx on public.plan_demand using gin (venue_ids);
create index if not exists plan_demand_areas_idx on public.plan_demand using gin (area_ids);

alter table public.plan_demand enable row level security;
-- No policies: nothing but the service role reads or writes it.
revoke all on public.plan_demand from anon, authenticated;

-- ── what a venue may see about itself ─────────────────────────────────────

create or replace function public.venue_insights(p_venue uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  my_area uuid;
  out jsonb;
begin
  if not (public.manages_venue(p_venue) or public.is_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select area_id into my_area from public.venues where id = p_venue;

  select jsonb_build_object(
    'days', p_days,
    -- Plans we built that included this venue.
    'in_plans', (select count(*) from public.plan_demand d where d.created_at >= since and p_venue = any (d.venue_ids)),
    'by_occasion', coalesce((
      select jsonb_object_agg(occasion, n) from (
        select coalesce(occasion, 'other') as occasion, count(*) as n from public.plan_demand d
        where d.created_at >= since and p_venue = any (d.venue_ids) group by 1
      ) t), '{}'::jsonb),
    'by_weekday', coalesce((
      select jsonb_object_agg(weekday, n) from (
        select weekday, count(*) as n from public.plan_demand d
        where d.created_at >= since and p_venue = any (d.venue_ids) and weekday is not null group by 1
      ) t), '{}'::jsonb),
    -- People who kept a plan with this venue in it.
    'saved', (
      select count(*) from public.plans p, jsonb_array_elements(coalesce(p.itinerary -> 'stops', '[]'::jsonb)) s
      where p.created_at >= since and s ->> 'venue_id' = p_venue::text
    ),
    'table_requests', (
      select count(*) from public.reservation_requests r where r.created_at >= since and r.venue_id = p_venue
    ),
    -- Demand in the venue's own area, met or not.
    'area_plans', (select count(*) from public.plan_demand d where d.created_at >= since and my_area = any (d.area_ids)),
    'area_unmet', (
      select count(*) from public.plan_demand d
      where d.created_at >= since and my_area = any (d.area_ids) and d.outcome = 'no_match'
    ),
    'area_occasions', coalesce((
      select jsonb_object_agg(occasion, n) from (
        select coalesce(occasion, 'other') as occasion, count(*) as n from public.plan_demand d
        where d.created_at >= since and my_area = any (d.area_ids) group by 1
      ) t), '{}'::jsonb),
    'area_budgets', coalesce((
      select jsonb_object_agg(budget_band, n) from (
        select coalesce(budget_band, 'unknown') as budget_band, count(*) as n from public.plan_demand d
        where d.created_at >= since and my_area = any (d.area_ids) group by 1
      ) t), '{}'::jsonb)
  ) into out;

  return out;
end;
$$;

revoke execute on function public.venue_insights(uuid, integer) from public, anon;
grant execute on function public.venue_insights(uuid, integer) to authenticated;
