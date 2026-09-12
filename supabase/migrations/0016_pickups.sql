-- Flowers and cakes, collected on the way.
--
-- Deliberately not venues. A venue is somewhere you spend time: it has a
-- duration, a party size, an order, and the planner routes a taxi to it. A
-- florist is an errand. You stop for four minutes and leave carrying
-- something, and modelling that as a stop would have the planner scheduling
-- forty minutes at a flower shop and costing the trip as part of the evening.
--
-- So a pickup sits before the first stop rather than inside the itinerary,
-- and its cost is added to the plan without occupying any of its time.

create table if not exists public.gift_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('flowers', 'cake')),
  area_id uuid references public.areas (id) on delete set null,
  address text,
  phone text,
  instagram_handle text,
  google_maps_url text,
  image_url text,
  /*
   * How much notice the vendor needs, in hours.
   *
   * The difference between flowers and cakes, and the reason this column
   * exists at all. Flowers are same-day almost everywhere; a decorated cake
   * usually is not. Offering a cake for tonight when the baker needs two days
   * would be the app confidently arranging something that cannot happen.
   */
  lead_time_hours integer not null default 0 check (lead_time_hours >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists gift_vendors_kind_idx
  on public.gift_vendors (kind) where is_active;

-- What the vendor actually sells. One row per thing you can point at.
create table if not exists public.gift_products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.gift_vendors (id) on delete cascade,
  name text not null,
  description text,
  /* The photograph is the whole point: nobody picks flowers from a list. */
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists gift_products_vendor_idx
  on public.gift_products (vendor_id, sort_order) where is_active;

/*
 * Sizes, and the only place a price lives.
 *
 * A dozen roses and six roses are the same product at different prices, and so
 * are an eight-inch and a ten-inch cake. One table covers both because they
 * are the same shape: a label somebody recognises, and what it costs.
 */
create table if not exists public.gift_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.gift_products (id) on delete cascade,
  label text not null,
  price_ghs numeric(10,2) not null check (price_ghs >= 0),
  /* Stems, inches, whatever the label counts. Null when it counts nothing. */
  magnitude integer,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create index if not exists gift_variants_product_idx
  on public.gift_variants (product_id, sort_order) where is_active;

-- ── what someone chose ──────────────────────────────────────────────────
--
-- Attached to the plan rather than embedded in its itinerary JSON, because a
-- pickup is a real-world commitment that may later carry an order, a payment
-- and a collection time. Those want rows of their own, not a field inside a
-- blob the planner rewrites every time somebody swaps a stop.

create table if not exists public.plan_pickups (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  variant_id uuid not null references public.gift_variants (id),
  quantity integer not null default 1 check (quantity between 1 and 20),
  /* Cake only: what goes on it. Ignored for flowers. */
  message text,
  colour text,
  /* A photograph of what they want it to look like. */
  reference_image_url text,
  note text,
  price_ghs numeric(10,2) not null check (price_ghs >= 0),
  created_at timestamptz not null default now()
);

create index if not exists plan_pickups_plan_idx on public.plan_pickups (plan_id);

-- ── access ──────────────────────────────────────────────────────────────

alter table public.gift_vendors enable row level security;
alter table public.gift_products enable row level security;
alter table public.gift_variants enable row level security;
alter table public.plan_pickups enable row level security;

-- The catalogue is public to read: it is a shop window, and plans are built
-- signed out.
create policy "gift vendors: public read" on public.gift_vendors
  for select using (is_active);
create policy "gift products: public read" on public.gift_products
  for select using (is_active);
create policy "gift variants: public read" on public.gift_variants
  for select using (is_active);

create policy "gift vendors: admin write" on public.gift_vendors
  for all using (public.is_admin()) with check (public.is_admin());
create policy "gift products: admin write" on public.gift_products
  for all using (public.is_admin()) with check (public.is_admin());
create policy "gift variants: admin write" on public.gift_variants
  for all using (public.is_admin()) with check (public.is_admin());

-- A pickup belongs to a plan, so it follows the plan's own visibility.
create policy "plan pickups: owner read" on public.plan_pickups
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );
create policy "plan pickups: owner write" on public.plan_pickups
  for insert with check (
    exists (
      select 1 from public.plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );
create policy "plan pickups: owner delete" on public.plan_pickups
  for delete using (
    exists (
      select 1 from public.plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

-- ── images ──────────────────────────────────────────────────────────────
--
-- Public read for the same reason avatars are: these appear on shared plans
-- that anyone with the link can open. No SELECT policy on storage.objects,
-- which would only enable listing, as migration 0012 established.

insert into storage.buckets (id, name, public)
values ('gifts', 'gifts', true)
on conflict (id) do nothing;

drop policy if exists "gifts: admin write" on storage.objects;
create policy "gifts: admin write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gifts' and public.is_admin());

drop policy if exists "gifts: admin update" on storage.objects;
create policy "gifts: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'gifts' and public.is_admin());
