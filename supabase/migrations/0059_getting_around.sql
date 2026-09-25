-- Getting around: how to reach a place, not just where it is.
--
-- A foreign ambassador two years into Accra still could not say which trotro
-- to take, or from where. The catalogue knows where every venue is and prices
-- the ride between stops, and says nothing at all about how to make that ride
-- without a car. This is the data for that, entered by hand and dated,
-- because there is no current public source for trotro routes and a wrong one
-- strands somebody at the wrong station at night.
--
-- Four tables:
--
--   trotro_stations  where trotros load: Circle, 37, Madina Station.
--   trotro_routes    one direct ride from one station to another, as
--                    somebody actually took it: what is called out, the
--                    fare, how long.
--   venue_access     per venue: what to tell a taxi driver, where to get off
--                    a trotro, and the walk from there.
--   car_rentals      who rents cars, with or without a driver.
--
-- Every row carries checked_on. Null means nobody has confirmed it, and the
-- page says "not checked" rather than presenting it as fact.
--
-- Read by anyone when active; written only by admins. No venue column grants
-- are touched: venue_access is its own table precisely so the venues grant,
-- which is column by column since 0013, does not need another entry.

-- ── stations ─────────────────────────────────────────────────────────────

create table if not exists public.trotro_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  area_id uuid references public.areas (id) on delete set null,
  lat numeric(9, 6),
  lng numeric(9, 6),
  -- How to find the loading point once you are there. "Circle" is a square
  -- kilometre; "the Nkrumah Circle side, under the overpass, by the Total"
  -- is somewhere to stand.
  where_exactly text check (where_exactly is null or char_length(where_exactly) <= 400),
  is_hub boolean not null default false,
  is_active boolean not null default true,
  checked_on date,
  created_at timestamptz not null default now()
);

create unique index if not exists trotro_stations_name_key
  on public.trotro_stations (lower(name));

-- ── routes ───────────────────────────────────────────────────────────────

create table if not exists public.trotro_routes (
  id uuid primary key default gen_random_uuid(),
  from_station_id uuid not null references public.trotro_stations (id) on delete cascade,
  to_station_id uuid not null references public.trotro_stations (id) on delete cascade,
  -- What the mate shouts, or what is written on the windscreen: the thing a
  -- newcomer actually listens and looks for.
  called_as text check (called_as is null or char_length(called_as) <= 120),
  -- Where in the station this one loads, when it is not obvious.
  board_note text check (board_note is null or char_length(board_note) <= 300),
  fare_min_ghs numeric(8, 2) check (fare_min_ghs is null or fare_min_ghs >= 0),
  fare_max_ghs numeric(8, 2) check (fare_max_ghs is null or fare_max_ghs >= 0),
  minutes integer check (minutes is null or minutes between 1 and 600),
  -- "5am to 10pm, every few minutes", "stops after 8pm".
  runs text check (runs is null or char_length(runs) <= 160),
  notes text check (notes is null or char_length(notes) <= 400),
  is_active boolean not null default true,
  checked_on date,
  created_at timestamptz not null default now(),
  check (from_station_id <> to_station_id),
  check (fare_min_ghs is null or fare_max_ghs is null or fare_min_ghs <= fare_max_ghs)
);

create index if not exists trotro_routes_from_idx on public.trotro_routes (from_station_id);
create index if not exists trotro_routes_to_idx on public.trotro_routes (to_station_id);

-- ── per venue ────────────────────────────────────────────────────────────

create table if not exists public.venue_access (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  -- What to tell a taxi or a Bolt driver. Accra runs on landmarks, not
  -- street numbers: "Oxford Street, opposite Koala".
  landmark text check (landmark is null or char_length(landmark) <= 200),
  -- The trotro stop to get off at, and what to say to the mate.
  station_id uuid references public.trotro_stations (id) on delete set null,
  drop_point text check (drop_point is null or char_length(drop_point) <= 200),
  walk_minutes integer check (walk_minutes is null or walk_minutes between 0 and 90),
  walk_directions text check (walk_directions is null or char_length(walk_directions) <= 400),
  checked_on date,
  updated_at timestamptz not null default now()
);

-- ── car rentals ──────────────────────────────────────────────────────────

create table if not exists public.car_rentals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  phone text,
  whatsapp_phone text,
  website text,
  -- In Ghana the usual arrangement is a car with a driver, by the day.
  with_driver boolean not null default true,
  self_drive boolean not null default false,
  day_rate_min_ghs numeric(10, 2) check (day_rate_min_ghs is null or day_rate_min_ghs >= 0),
  day_rate_max_ghs numeric(10, 2) check (day_rate_max_ghs is null or day_rate_max_ghs >= 0),
  areas_served text check (areas_served is null or char_length(areas_served) <= 200),
  notes text check (notes is null or char_length(notes) <= 400),
  is_active boolean not null default true,
  checked_on date,
  created_at timestamptz not null default now()
);

-- ── access ───────────────────────────────────────────────────────────────

alter table public.trotro_stations enable row level security;
alter table public.trotro_routes enable row level security;
alter table public.venue_access enable row level security;
alter table public.car_rentals enable row level security;

drop policy if exists "trotro_stations: read" on public.trotro_stations;
create policy "trotro_stations: read" on public.trotro_stations
  for select using (is_active or public.is_admin());
drop policy if exists "trotro_stations: admin write" on public.trotro_stations;
create policy "trotro_stations: admin write" on public.trotro_stations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "trotro_routes: read" on public.trotro_routes;
create policy "trotro_routes: read" on public.trotro_routes
  for select using (is_active or public.is_admin());
drop policy if exists "trotro_routes: admin write" on public.trotro_routes;
create policy "trotro_routes: admin write" on public.trotro_routes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "venue_access: read" on public.venue_access;
create policy "venue_access: read" on public.venue_access
  for select using (true);
drop policy if exists "venue_access: admin write" on public.venue_access;
create policy "venue_access: admin write" on public.venue_access
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "car_rentals: read" on public.car_rentals;
create policy "car_rentals: read" on public.car_rentals
  for select using (is_active or public.is_admin());
drop policy if exists "car_rentals: admin write" on public.car_rentals;
create policy "car_rentals: admin write" on public.car_rentals
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.trotro_stations, public.trotro_routes, public.venue_access, public.car_rentals
  to anon, authenticated;
grant insert, update, delete on public.trotro_stations, public.trotro_routes, public.venue_access, public.car_rentals
  to authenticated;
