-- aduro — initial schema
-- Run against a fresh Supabase project (supabase db push, or paste into the SQL editor).

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────
create type venue_type as enum ('restaurant', 'activity', 'lounge', 'outdoor', 'cafe', 'dessert');
create type price_band as enum ('budget', 'mid', 'premium');
create type menu_category as enum ('starter', 'main', 'dessert', 'drink', 'other');

-- ── Profiles (admin flag) ────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used by RLS policies.
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ── Catalog tables ───────────────────────────────────────────────────────
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default 'Accra'
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type venue_type not null,
  area_id uuid not null references public.areas (id) on delete restrict,
  vibe_tags text[] not null default '{}',
  dress_code text,
  price_band price_band not null default 'mid',
  avg_cost_per_person_ghs numeric not null default 0,
  description text not null default '',
  best_for text[] not null default '{}',
  reservation_required boolean not null default false,
  instagram_handle text,
  phone text,
  google_maps_url text,
  image_url text,
  is_active boolean not null default true,
  lat numeric,
  lng numeric,
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name text not null,
  category menu_category not null default 'other',
  price_ghs numeric not null,
  notes text,
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh for the admin "stale data" indicator.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger menu_items_touch
  before update on public.menu_items
  for each row execute function public.touch_updated_at();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  venue_id uuid references public.venues (id) on delete set null,
  area_id uuid not null references public.areas (id) on delete restrict,
  event_date date not null,
  start_time time,
  cost_ghs numeric,
  category text not null,
  source_url text,
  is_active boolean not null default true
);

-- ── Plans (saved itineraries) ────────────────────────────────────────────
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  share_slug text not null unique,
  inputs jsonb not null,
  itinerary jsonb not null,
  total_budget_ghs numeric not null,
  estimated_total_ghs numeric not null,
  created_at timestamptz not null default now()
);

create index plans_user_idx on public.plans (user_id, created_at desc);
create index venues_area_idx on public.venues (area_id) where is_active;
create index events_date_idx on public.events (event_date) where is_active;
create index menu_items_venue_idx on public.menu_items (venue_id);

-- ── Row Level Security ───────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.areas enable row level security;
alter table public.venues enable row level security;
alter table public.menu_items enable row level security;
alter table public.events enable row level security;
alter table public.plans enable row level security;

-- profiles: users read their own row; admins read all.
create policy "profiles: own read" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
create policy "profiles: admin update" on public.profiles
  for update using (public.is_admin());

-- Catalog: public read, admin-only writes.
create policy "areas: public read" on public.areas for select using (true);
create policy "areas: admin write" on public.areas
  for all using (public.is_admin()) with check (public.is_admin());

create policy "venues: public read" on public.venues for select using (true);
create policy "venues: admin write" on public.venues
  for all using (public.is_admin()) with check (public.is_admin());

create policy "menu_items: public read" on public.menu_items for select using (true);
create policy "menu_items: admin write" on public.menu_items
  for all using (public.is_admin()) with check (public.is_admin());

create policy "events: public read" on public.events for select using (true);
create policy "events: admin write" on public.events
  for all using (public.is_admin()) with check (public.is_admin());

-- plans: owners manage their own plans. Shared links are served server-side
-- with the service role key (no public SELECT policy needed).
create policy "plans: own read" on public.plans
  for select using (auth.uid() = user_id);
create policy "plans: own insert" on public.plans
  for insert with check (auth.uid() = user_id);
create policy "plans: own delete" on public.plans
  for delete using (auth.uid() = user_id);
