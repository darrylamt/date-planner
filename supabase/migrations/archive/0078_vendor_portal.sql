-- Cake and flower vendors run their own listings; and a menu upload switches
-- its venue back on.
--
-- ── 1. A venue comes back when its menu does ───────────────────────────
-- Venues switched off for having no price stayed off after their menu was
-- uploaded (Club Smooth, Theia Coffee House, Exhale Lounge), because only
-- pricing through the admin's unpriced queue switched them on. Now a priced
-- menu item added by an admin or the server switches its venue on, unless
-- the place is closed. Not when a venue's own login adds one: an owner may
-- have hidden their listing on purpose (ListingEditor's "temporarily hide").

create or replace function public.menu_switches_venue_on()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_ghs > 0 and (auth.uid() is null or public.is_admin()) then
    update public.venues
       set is_active = true
     where id = new.venue_id
       and not is_active
       and coalesce(business_status, '') not like 'CLOSED%'
       and coalesce(verification_status, '') <> 'closed';
  end if;
  return new;
end;
$$;

revoke execute on function public.menu_switches_venue_on() from public, anon, authenticated;

drop trigger if exists menu_items_switch_venue_on on public.menu_items;
create trigger menu_items_switch_venue_on
  after insert on public.menu_items
  for each row execute function public.menu_switches_venue_on();

-- ── 2. Vendors apply ───────────────────────────────────────────────────
-- A cake or flower business asks to be listed from /vendor/apply. Nothing
-- goes live from an application: an admin reads it, and approving it is what
-- creates the vendor and its login. Written and read only by the server.

create table if not exists public.vendor_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  business_name text not null check (length(business_name) between 2 and 80),
  kind text not null check (kind in ('flowers', 'cake')),
  contact_name text check (contact_name is null or length(contact_name) <= 80),
  phone text not null check (length(phone) <= 30),
  whatsapp_phone text check (whatsapp_phone is null or length(whatsapp_phone) <= 30),
  instagram_handle text check (instagram_handle is null or length(instagram_handle) <= 60),
  area text check (area is null or length(area) <= 60),
  note text check (note is null or length(note) <= 600),
  image_url text,
  status text not null default 'new' check (status in ('new', 'approved', 'declined')),
  decided_at timestamptz,
  vendor_id uuid references public.gift_vendors (id) on delete set null
);

alter table public.vendor_applications enable row level security;
-- No policies: only the service role reads or writes applications.

-- ── 3. Vendor logins ───────────────────────────────────────────────────
-- One login runs one vendor. Issued by an admin, like a planner's, with a
-- username on the same synthetic domain (venues.aduro.invalid).

create table if not exists public.vendor_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  vendor_id uuid not null references public.gift_vendors (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.vendor_users enable row level security;
drop policy if exists "vendor users: read own" on public.vendor_users;
create policy "vendor users: read own" on public.vendor_users
  for select using (user_id = auth.uid());

create or replace function public.manages_gift_vendor(v uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.vendor_users where user_id = auth.uid() and vendor_id = v);
$$;
revoke execute on function public.manages_gift_vendor(uuid) from public;
grant execute on function public.manages_gift_vendor(uuid) to authenticated;

create or replace function public.manages_gift_product(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.gift_products gp
    join public.vendor_users vu on vu.vendor_id = gp.vendor_id
    where gp.id = p and vu.user_id = auth.uid()
  );
$$;
revoke execute on function public.manages_gift_product(uuid) from public;
grant execute on function public.manages_gift_product(uuid) to authenticated;

-- Their own listing, switched off or not, and its products and sizes.
drop policy if exists "gift vendors: vendor read own" on public.gift_vendors;
create policy "gift vendors: vendor read own" on public.gift_vendors
  for select using (public.manages_gift_vendor(id));
drop policy if exists "gift vendors: vendor update own" on public.gift_vendors;
create policy "gift vendors: vendor update own" on public.gift_vendors
  for update using (public.manages_gift_vendor(id)) with check (public.manages_gift_vendor(id));

drop policy if exists "gift products: vendor write own" on public.gift_products;
create policy "gift products: vendor write own" on public.gift_products
  for all using (public.manages_gift_vendor(vendor_id)) with check (public.manages_gift_vendor(vendor_id));

drop policy if exists "gift variants: vendor write own" on public.gift_variants;
create policy "gift variants: vendor write own" on public.gift_variants
  for all using (public.manages_gift_product(product_id)) with check (public.manages_gift_product(product_id));

-- The shop's name and what it sells stay as approved. A vendor edits the rest
-- of their row; renaming goes through an admin, so the name people see is
-- the shop we checked.
create or replace function public.gift_vendor_keeps_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.name := old.name;
    new.kind := old.kind;
  end if;
  return new;
end;
$$;

drop trigger if exists gift_vendors_keep_name on public.gift_vendors;
create trigger gift_vendors_keep_name
  before update on public.gift_vendors
  for each row execute function public.gift_vendor_keeps_name();
