-- Places to stay, entered now so Trips within Ghana fits when it is built
-- (owner, 28 Oct 2026; the plan in .claude/plans). And what people do not eat.
--
-- 1. A stay is a venue of type 'stay': everything venues already have
--    (photos, the phone, the Maps pin, the portal) carries over. Outing plans
--    never use one (matching.ts filters it), and the app and the website do
--    not see one until Trips is built: the public read below hides them from
--    everyone but admins and the stay's own portal login.
-- 2. stay_details: one row per stay. The region and town (Trips plans by
--    destination, and a lodge at Wli is nowhere near one of our Accra
--    neighbourhoods), the kind of place, check-in and check-out, amenities,
--    things to do there, and a contact email.
-- 3. stay_rooms: each room type with how many it sleeps and its nightly rate.
--    A rate somebody checked, with the date: never a guess.
-- 4. A "stays" staff role, for a team member who enters them.
-- 5. plan_demand.diet: what each plan's people do not eat (the planner's
--    new question), for counting.
--
-- New tables follow 0080: RLS on, no policies, writes by the server only.
-- Run npm run audit:smoke afterwards.

-- ── 1. the venue type ───────────────────────────────────────────────────
alter type public.venue_type add value if not exists 'stay';

-- Who may see a stay before Trips: an admin, or the stay's own portal login.
-- Security definer, because anon cannot run manages_venue (0038) and a
-- policy calling it would fail every signed-out read that met a stay.
create or replace function public.sees_stay(v uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.manages_venue(v);
$$;
revoke all on function public.sees_stay(uuid) from public;
grant execute on function public.sees_stay(uuid) to anon, authenticated;

-- Compared as text: the new enum value cannot be used as one in the same run.
-- CASE, so the check runs only for stays and every other venue reads as before.
drop policy if exists "venues: public read" on public.venues;
create policy "venues: public read" on public.venues
  for select using (case when type::text = 'stay' then public.sees_stay(id) else true end);

-- ── 2. what a stay is ───────────────────────────────────────────────────
create table if not exists public.stay_details (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  kind text not null default 'hotel'
    check (kind in ('hotel', 'guesthouse', 'apartment', 'resort', 'lodge', 'eco_lodge', 'hostel', 'homestay', 'villa', 'other')),
  region text not null check (region in (
    'Greater Accra', 'Ashanti', 'Western', 'Western North', 'Central', 'Eastern', 'Volta', 'Oti',
    'Northern', 'Savannah', 'North East', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo'
  )),
  town text check (town is null or char_length(town) <= 80),
  address text check (address is null or char_length(address) <= 300),
  email text check (email is null or char_length(email) <= 200),
  check_in text check (check_in is null or check_in ~ '^[0-2][0-9]:[0-5][0-9]$'),
  check_out text check (check_out is null or check_out ~ '^[0-2][0-9]:[0-5][0-9]$'),
  min_nights smallint check (min_nights is null or min_nights between 1 and 60),
  amenities text[] not null default '{}',
  activities text[] not null default '{}',
  notes text check (notes is null or char_length(notes) <= 2000),
  rates_checked_on date,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stay_details_region_idx on public.stay_details (region, town);

-- ── 3. rooms and nightly rates ──────────────────────────────────────────
create table if not exists public.stay_rooms (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  room_type text not null default 'double'
    check (room_type in ('single', 'double', 'twin', 'triple', 'family', 'suite', 'dorm', 'apartment', 'chalet', 'tent', 'other')),
  sleeps smallint not null default 2 check (sleeps between 1 and 30),
  price_per_night_ghs numeric(10, 2) check (price_per_night_ghs is null or price_per_night_ghs >= 0),
  weekend_price_ghs numeric(10, 2) check (weekend_price_ghs is null or weekend_price_ghs >= 0),
  breakfast_included boolean not null default false,
  units smallint check (units is null or units between 1 and 500),
  notes text check (notes is null or char_length(notes) <= 500),
  is_active boolean not null default true,
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stay_rooms_venue_idx on public.stay_rooms (venue_id, sort);

alter table public.stay_details enable row level security;
alter table public.stay_rooms enable row level security;
revoke all on public.stay_details from anon, authenticated;
revoke all on public.stay_rooms from anon, authenticated;
-- No policies: the admin writes as the server. Trips will add a public read.

-- ── 4. a team member for stays ──────────────────────────────────────────
alter table public.staff_roles drop constraint if exists staff_roles_role_check;
alter table public.staff_roles add constraint staff_roles_role_check
  check (role in ('photos', 'menus', 'events', 'stays'));

-- ── 5. what plans' people do not eat ───────────────────────────────────
alter table public.plan_demand add column if not exists diet text[] not null default '{}';
