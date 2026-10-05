-- 0073: activities from Gaderin, and the events they become.
--
-- Gaderin (thegaderin.com) lists experiences across Ghana, and has given
-- written permission for Duro to read them. scripts/scrape-gaderin.ts reads
-- the site once a day into gaderin_activities, a faithful copy of what
-- Gaderin publishes, and then turns the ones it can place at a Duro venue
-- into dated rows in public.events, which is what the planner reads.
--
-- Keyed on Gaderin's slug, so a swap to their API later changes the reader
-- and nothing else.

create table if not exists public.gaderin_activities (
  slug              text primary key,
  url               text not null,
  title             text,
  description       text,
  category          text,
  -- The cheapest ticket, per person; every tier is in price_tiers.
  price_ghs         numeric,
  price_tiers       jsonb,
  gaderin_points    integer,
  -- Gaderin's own words for where: a town or a neighbourhood.
  location          text,
  -- A GhanaPost GPS code, e.g. GA-123-4567. Its first letters are the region.
  address           text,
  host_name         text,
  -- A one-off date, or a weekly pattern, or both, as Gaderin holds them.
  event_date        date,
  start_time        text,
  duration_hours    numeric,
  is_recurring      boolean not null default false,
  recurrence        jsonb,
  image_url         text,
  photos            jsonb,
  -- Where Duro places it: matched by the scraper, or set by hand in admin.
  area_id           uuid references public.areas(id) on delete set null,
  venue_id          uuid references public.venues(id) on delete set null,
  -- The sitemap's lastmod when last read, so unchanged pages are not fetched daily.
  sitemap_lastmod   text,
  source            text not null default 'gaderin',
  is_active         boolean not null default true,
  scraped_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists gaderin_activities_active_idx
  on public.gaderin_activities (is_active, category);
create index if not exists gaderin_activities_venue_idx
  on public.gaderin_activities (venue_id) where venue_id is not null;

-- Readable by the app and the site (active only); written only by the service role.
alter table public.gaderin_activities enable row level security;
drop policy if exists "Public can read active Gaderin activities" on public.gaderin_activities;
create policy "Public can read active Gaderin activities"
  on public.gaderin_activities for select
  using (is_active = true);

-- An event made from somewhere else carries a key to find it again: one row
-- per activity per date, so each day's run updates in place, and a date that
-- has gone from Gaderin can be taken off. Null for every event made by hand.
alter table public.events add column if not exists external_key text;
-- Not partial: an upsert's ON CONFLICT needs a plain unique index, and
-- Postgres lets any number of rows share a null in one.
create unique index if not exists events_external_key_idx
  on public.events (external_key);
