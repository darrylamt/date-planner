-- Where people ask to go on Trips, and whether we could plan it (the Trips
-- plan, 25 Oct 2026: "trip_demand: where people asked to go, and whether we
-- had it. This drives what gets filled next"). Written by /api/trip/generate
-- for every trip built, read by /admin/trips.
--
-- Anonymous: the account or phone is kept only as a keyed hash (rateKey in
-- rateLimit.ts), enough to count repeat asks and no way back to who asked.
--
-- New table follows 0080: RLS on, no policies, server only. Run
-- npm run audit:smoke afterwards.

create table if not exists public.trip_demand (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  destination text not null check (char_length(destination) <= 40),
  from_town text not null check (char_length(from_town) <= 80),
  arrive date not null,
  nights smallint not null check (nights between 1 and 14),
  party_size smallint not null check (party_size between 1 and 20),
  comfort text not null check (comfort in ('easy', 'mid', 'treat')),
  travel text not null check (char_length(travel) <= 20),
  ready boolean not null,
  -- What the trip could not do, in the words it showed.
  gaps text[] not null default '{}',
  parts_planned smallint not null default 0,
  parts_total smallint not null default 0,
  who text check (who is null or char_length(who) <= 80),
  platform text check (platform is null or platform in ('ios', 'android', 'web')),
  app_version text check (app_version is null or char_length(app_version) <= 32)
);

create index if not exists trip_demand_dest_idx on public.trip_demand (destination, created_at desc);

alter table public.trip_demand enable row level security;
revoke all on public.trip_demand from anon, authenticated;
