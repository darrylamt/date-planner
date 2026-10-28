-- What people do with Duro!, counted well enough to answer an investor's
-- questions and our own (27 Oct 2026). Three parts.
--
-- 1. plan_demand learns more about each plan, still without anybody in it:
--    - planner: a one-way hash of the account or the phone, so ten plans by
--      one person can be told from ten people. Never reversible to either.
--    - team: the plan was made by an admin or staff login, so testing can be
--      left out of the numbers.
--    - est_total_ghs: what the plan comes to, so "GHS planned through Duro!"
--      covers every plan and not only saved ones.
--    - platform, app_version: ios, android or web, and which build.
--    - budget_chosen: the person moved the budget themselves; false means
--      they kept the starting one. kept_defaults: which other answers were
--      left as they started (date, time).
--    - orders: every dish and drink the plan ordered, by venue, so what
--      people are sent to eat is on record for every plan.
--
-- 2. usage_events: one table for what the app does between plans.
--    - app_open: once a day per phone, for retention.
--    - step_viewed: each question of the planner reached, for where people stop.
--    - search: what was typed on the Venues tab or the area step, with how
--      many places matched; venue_opened: a venue opened from there.
--    - went: the answer to "Did you go?" after a saved plan's date.
--    - heard_from: how somebody found Duro!, asked once.
--    Device id as plan_signals keeps it; the account only when signed in.
--
-- 3. plan_signals gains 'dish_kept': the dishes on a plan that was saved.

alter table public.plan_demand
  add column if not exists planner text check (planner is null or planner ~ '^[0-9a-f]{16,64}$'),
  add column if not exists team boolean not null default false,
  add column if not exists est_total_ghs integer,
  add column if not exists platform text check (platform is null or platform in ('ios', 'android', 'web')),
  add column if not exists app_version text check (app_version is null or char_length(app_version) <= 32),
  add column if not exists budget_chosen boolean,
  add column if not exists kept_defaults text[] not null default '{}',
  add column if not exists orders jsonb;

create index if not exists plan_demand_planner_idx on public.plan_demand (planner, created_at desc);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  day date not null default (now() at time zone 'utc')::date,
  device_id text not null check (device_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  user_id uuid references auth.users (id) on delete set null,
  platform text check (platform is null or platform in ('ios', 'android', 'web')),
  app_version text check (app_version is null or char_length(app_version) <= 32),
  kind text not null check (kind in ('app_open', 'step_viewed', 'search', 'venue_opened', 'went', 'heard_from')),
  name text check (name is null or char_length(name) <= 80),
  value integer,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 2000)
);

create index if not exists usage_events_kind_idx on public.usage_events (kind, created_at desc);
create index if not exists usage_events_device_idx on public.usage_events (device_id, day);
-- One app_open per phone per day: the insert that repeats it fails, and that is the answer.
create unique index if not exists usage_events_open_once on public.usage_events (device_id, day) where kind = 'app_open';
-- One answer per plan per phone to "Did you go?", and to "How did you hear about Duro!?".
create unique index if not exists usage_events_went_once on public.usage_events (device_id, name) where kind = 'went';
create unique index if not exists usage_events_heard_once on public.usage_events (device_id) where kind = 'heard_from';

alter table public.usage_events enable row level security;
-- No policies: only the server (service role) reads or writes it.

alter table public.plan_signals drop constraint if exists plan_signals_kind_check;
alter table public.plan_signals add constraint plan_signals_kind_check check (kind in (
  'shown', 'swapped_away', 'swapped_in', 'saved', 'shared', 'details_opened', 'menu_opened',
  'book_tapped', 'directions_tapped', 'maps_opened', 'instagram_opened', 'venue_viewed',
  'dish_added', 'dish_removed', 'dish_kept'
));
