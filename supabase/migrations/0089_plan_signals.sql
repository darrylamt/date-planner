-- What people do with the places in their plans (src/app/api/signals).
--
-- The raw material for each venue's pull rate (kept or engaged with, out of
-- times shown) and for each person's taste. One row per thing done:
--   shown            the venue was a stop in a plan they were given
--   swapped_away     they swapped it out of a plan
--   swapped_in       it came in by a swap
--   saved            it was a stop in a plan they saved
--   shared           it was a stop in a plan they shared
--   details_opened   they opened its stop's details
--   menu_opened      they opened its menu or price list
--   book_tapped      Reserve, Tickets or Book seats
--   directions_tapped Get there
--   maps_opened, instagram_opened   from the stop's More menu
--   venue_viewed     its venue page; value is the time spent there, in ms
--
-- About places, never about people: nothing here is a score of a person.
-- The privacy policy says Duro learns from what people keep and swap. A
-- device id (random, made by the app) and the account when signed in, so a
-- person's taste can follow them; nothing else about them.
--
-- Written and read only by the service role, like every table since 0080:
-- RLS on, everything revoked from anon and authenticated, no policies.

create table if not exists public.plan_signals (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  device_id text not null check (device_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  user_id uuid references auth.users (id) on delete set null,
  venue_id uuid not null references public.venues (id) on delete cascade,
  kind text not null check (kind in (
    'shown', 'swapped_away', 'swapped_in', 'saved', 'shared', 'details_opened', 'menu_opened',
    'book_tapped', 'directions_tapped', 'maps_opened', 'instagram_opened', 'venue_viewed'
  )),
  /** One generated plan, so its shown, swaps and save can be read together. */
  plan_key text check (plan_key is null or plan_key ~ '^[A-Za-z0-9_-]{6,64}$'),
  occasion text check (occasion is null or occasion ~ '^[a-z_]{1,32}$'),
  /** Time spent, in ms, for venue_viewed; null otherwise. */
  value integer check (value is null or value between 0 and 3600000)
);

create index if not exists plan_signals_venue on public.plan_signals (venue_id, kind, created_at desc);
create index if not exists plan_signals_device on public.plan_signals (device_id, created_at desc);
create index if not exists plan_signals_user on public.plan_signals (user_id, created_at desc) where user_id is not null;

alter table public.plan_signals enable row level security;
revoke all on public.plan_signals from anon, authenticated;
