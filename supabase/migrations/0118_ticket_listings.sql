-- 0118: events read from ticketing sites (Aya Tickets, passa), waiting for
-- the events team (owner, 26 Nov 2026).
--
-- scripts/scrape-tickets.ts reads each site's sitemap and the public event
-- pages it allows (robots.txt), and keeps the facts here: name, when, where,
-- the cheapest ticket, the page. Nothing reaches the planner until someone
-- approves a listing in Admin -> Event listings, which matches it to a venue
-- and creates the event (events.external_key = '<source>:<slug>'), booked on
-- the ticketing site.
--
-- Only the server and admin pages touch it (service role): no policies.

create table if not exists public.ticket_listings (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('aya', 'passa')),
  -- The site's own address for the event, which is also where tickets are bought.
  url text not null unique,
  slug text not null,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  -- Where, as the site gives it: a venue name and address (Aya), or only an area (passa).
  place_name text,
  place_address text,
  lat double precision,
  lng double precision,
  organiser text,
  -- The cheapest ticket one person can still buy (not VIP or a table); null when the site gives none.
  price_ghs numeric,
  sold_out boolean not null default false,
  -- For the reviewer only: never published from here.
  image_url text,
  description text,
  -- The catalogue venue it looks like, for the reviewer to confirm.
  suggested_venue_id uuid references public.venues(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'approved', 'rejected', 'past')),
  event_id uuid references public.events(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  -- The sitemap's date for the page, to skip pages that have not changed.
  lastmod text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists ticket_listings_status_idx on public.ticket_listings (status, starts_at);

alter table public.ticket_listings enable row level security;
revoke all on public.ticket_listings from anon, authenticated;
