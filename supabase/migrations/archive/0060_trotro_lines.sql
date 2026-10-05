-- Trotro lines: a route as the road it runs, not just its two ends.
--
-- 0059 held a trotro ride as station to station, which is how somebody
-- describes one trip they took. It is not how trotros work: a Circle to
-- Madina trotro stops anywhere along the road, and most people board and
-- leave it somewhere in the middle. So a line here is an ordered list of
-- stops, and a trip can start at the stop nearest you and end at the one
-- nearest where you are going.
--
-- Seeded from the 2019 Accra route map (OpenStreetMap Ghana with Digital
-- Transport for Africa, published as GTFS): 277 routes, 4,171 stops, one line
-- per direction. That map is six years old and carries no fares, and its
-- minutes between stops are estimated from distance rather than timed, so
-- every imported line starts 'unchecked'. The page labels it as such until an
-- admin confirms it, edits it, or hides it.
--
-- Map data is © OpenStreetMap contributors, under the Open Database Licence:
-- it must be credited where it is shown, and this derived table stays open.

create table if not exists public.trotro_stops (
  id uuid primary key default gen_random_uuid(),
  gtfs_stop_id text unique,
  name text not null,
  lat numeric(9, 6) not null,
  lng numeric(9, 6) not null,
  -- A name a newcomer can use. The map calls 38 different stops "Junction"
  -- and 25 "Total"; "Junction, by the Madina Zongo mosque" is a place.
  landmark text check (landmark is null or char_length(landmark) <= 160),
  created_at timestamptz not null default now()
);

create table if not exists public.trotro_lines (
  id uuid primary key default gen_random_uuid(),
  gtfs_trip_id text unique,
  gtfs_route_id text,
  name text not null,
  -- Which way this direction runs: the map's headsign, "Circle", "Madina".
  headsign text,
  -- A trotro every so many minutes, from the map's surveyed frequencies.
  headway_mins integer check (headway_mins is null or headway_mins between 1 and 240),
  source text not null default 'map_2019' check (source in ('map_2019', 'manual')),
  status text not null default 'unchecked' check (status in ('unchecked', 'confirmed', 'hidden')),
  called_as text check (called_as is null or char_length(called_as) <= 120),
  fare_min_ghs numeric(8, 2) check (fare_min_ghs is null or fare_min_ghs >= 0),
  fare_max_ghs numeric(8, 2) check (fare_max_ghs is null or fare_max_ghs >= 0),
  notes text check (notes is null or char_length(notes) <= 400),
  checked_on date,
  created_at timestamptz not null default now()
);

create index if not exists trotro_lines_route_idx on public.trotro_lines (gtfs_route_id);

create table if not exists public.trotro_line_stops (
  line_id uuid not null references public.trotro_lines (id) on delete cascade,
  seq integer not null,
  stop_id uuid not null references public.trotro_stops (id) on delete cascade,
  -- Minutes from the first stop, as the map estimated them.
  minutes numeric(6, 1),
  primary key (line_id, seq)
);

create index if not exists trotro_line_stops_stop_idx on public.trotro_line_stops (stop_id);

alter table public.trotro_stops enable row level security;
alter table public.trotro_lines enable row level security;
alter table public.trotro_line_stops enable row level security;

drop policy if exists "trotro_stops: read" on public.trotro_stops;
create policy "trotro_stops: read" on public.trotro_stops for select using (true);
drop policy if exists "trotro_stops: admin write" on public.trotro_stops;
create policy "trotro_stops: admin write" on public.trotro_stops
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "trotro_lines: read" on public.trotro_lines;
create policy "trotro_lines: read" on public.trotro_lines
  for select using (status <> 'hidden' or public.is_admin());
drop policy if exists "trotro_lines: admin write" on public.trotro_lines;
create policy "trotro_lines: admin write" on public.trotro_lines
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "trotro_line_stops: read" on public.trotro_line_stops;
create policy "trotro_line_stops: read" on public.trotro_line_stops for select using (true);
drop policy if exists "trotro_line_stops: admin write" on public.trotro_line_stops;
create policy "trotro_line_stops: admin write" on public.trotro_line_stops
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.trotro_stops, public.trotro_lines, public.trotro_line_stops to anon, authenticated;
grant insert, update, delete on public.trotro_stops, public.trotro_lines, public.trotro_line_stops to authenticated;
