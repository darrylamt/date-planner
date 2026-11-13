-- 0108: what people asked Durobot for that Duro does not hold (13 Nov 2026).
--
-- A place by name, an area we don't cover, a dish on no menu, an event nobody
-- listed: each search that comes back empty writes one row, so the catalogue
-- is filled from what people actually ask for. Admin → Demand lists them.
--
-- No user id: what was asked is enough, and the row stays anonymous.
-- The service role writes and reads; nobody else can (RLS on, no policies).

create table if not exists public.chat_misses (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('place', 'area', 'dish', 'event')),
  query text not null check (char_length(query) between 1 and 200),
  area text check (area is null or char_length(area) <= 120)
);

alter table public.chat_misses enable row level security;
revoke all on public.chat_misses from anon, authenticated;

create index if not exists chat_misses_created_at on public.chat_misses (created_at desc);
