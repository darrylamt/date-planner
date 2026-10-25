-- Staff logins with one job each (src/lib/staff.ts, /admin/team).
--
-- Until now the admin was all or nothing: profiles.is_admin opened every
-- table. The owner wants to hand logins to people who do one thing, so a
-- role is a row here and the database, not the screens, holds the line:
--
--   photos   a venue's cover and gallery (and how it looks, aesthetics), and an
--            event's image. Nothing else on either.
--   menus    dishes (menu_items, all of it), and the venue's pricing fields:
--            per-person figure, band, pricing mode, charges, cuisines, sharing.
--   events   events (all of it) and, through the API, Gaderin listings.
--
-- On venues each role may change only its own columns. Anything else a save
-- sends is put back to its old value rather than refused, the same as 0047
-- does for venue logins, because the admin screens send whole rows.
--
-- Every write by a staff login lands in staff_edits with what changed, so
-- their work can be checked and put back. Full admins are not logged here.

-- ── 1. the roles ────────────────────────────────────────────────────────
create table if not exists public.staff_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('photos', 'menus', 'events')),
  username text,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.staff_roles enable row level security;
revoke all on public.staff_roles from anon, authenticated;

create or replace function public.has_staff_role(r text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff_roles where user_id = auth.uid() and role = r);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff_roles where user_id = auth.uid());
$$;

-- Callable by signed-in users (the policies below run as them); they reveal
-- only whether the caller themselves holds a role.
revoke execute on function public.has_staff_role(text) from public, anon;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.has_staff_role(text) to authenticated;
grant execute on function public.is_staff() to authenticated;

-- ── 2. what each role may write ─────────────────────────────────────────
drop policy if exists "venues: staff update" on public.venues;
create policy "venues: staff update" on public.venues
  for update using (public.has_staff_role('photos') or public.has_staff_role('menus'))
  with check (public.has_staff_role('photos') or public.has_staff_role('menus'));

drop policy if exists "menu_items: staff write" on public.menu_items;
create policy "menu_items: staff write" on public.menu_items
  for all using (public.has_staff_role('menus')) with check (public.has_staff_role('menus'));

drop policy if exists "events: staff write" on public.events;
create policy "events: staff write" on public.events
  for all using (public.has_staff_role('events')) with check (public.has_staff_role('events'));

drop policy if exists "events: photos update" on public.events;
create policy "events: photos update" on public.events
  for update using (public.has_staff_role('photos')) with check (public.has_staff_role('photos'));

-- ── 3. venues: only your own columns ────────────────────────────────────
-- 0048's version of 0047's function, with a staff branch in front of the
-- venue-login branch. A venue login's own list is exactly as before.
create or replace function public.venues_enforce_portal_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- What a venue may change about itself: 0047's list plus 0048's booking_url, unchanged.
  portal text[] := array[
    'description', 'phone', 'whatsapp_phone', 'booking_url', 'instagram_handle', 'image_url', 'gallery_urls',
    'opening_periods', 'opening_hours_text', 'hours_synced_at', 'dress_code', 'reservation_required',
    'is_active', 'cuisines', 'cuisine', 'vibe_tags', 'best_for', 'min_party_size', 'max_party_size',
    'minimum_spend_ghs', 'avg_cost_per_person_ghs', 'google_maps_url', 'lat', 'lng'
  ];
  photos text[] := array['image_url', 'gallery_urls', 'aesthetics'];
  menus text[] := array[
    'avg_cost_per_person_ghs', 'price_band', 'pricing_mode', 'unit_price_ghs', 'price_source',
    'price_spread', 'minimum_spend_ghs', 'cuisine', 'cuisines', 'menu_shared_from',
    'has_vegetarian_options', 'dietary_checked_at', 'dietary_source', 'is_free',
    'service_charge_pct', 'tax_added_pct', 'charges_note', 'entry_fee_ghs'
  ];
  allowed text[] := '{}';
  merged jsonb;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if public.has_staff_role('photos') then allowed := allowed || photos; end if;
  if public.has_staff_role('menus') then allowed := allowed || menus; end if;
  -- A venue login keeps its own list for its own venue, staff or not.
  if public.manages_venue(old.id) or not public.is_staff() then allowed := allowed || portal; end if;

  select jsonb_object_agg(key, case when key = any(allowed) then n.value else o.value end)
    into merged
    from jsonb_each(to_jsonb(old)) o(key, value)
    join jsonb_each(to_jsonb(new)) n(key, value) using (key);

  new := jsonb_populate_record(old, merged);
  return new;
end;
$$;
revoke execute on function public.venues_enforce_portal_columns() from public, anon, authenticated;

-- ── 4. events: organiser stamping skips events staff; photos-only touches the image ──
create or replace function public.events_enforce_organiser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  merged jsonb;
begin
  if not public.is_client_caller() then
    return new;
  end if;

  -- Events staff edit anybody's event as the admin would; the organiser stays as it was.
  if public.has_staff_role('events') then
    if tg_op = 'UPDATE' then
      new.created_by := old.created_by;
      new.organiser_name := old.organiser_name;
      new.organiser_logo_url := old.organiser_logo_url;
    end if;
    return new;
  end if;

  -- Photos staff (and only them, on an event that is not their own): the image alone.
  if tg_op = 'UPDATE' and public.has_staff_role('photos')
     and not exists (select 1 from public.event_planners where user_id = auth.uid()) then
    select jsonb_object_agg(key, case when key = 'image_url' then n.value else o.value end)
      into merged
      from jsonb_each(to_jsonb(old)) o(key, value)
      join jsonb_each(to_jsonb(new)) n(key, value) using (key);
    new := jsonb_populate_record(old, merged);
    return new;
  end if;

  select display_name, logo_url into p from public.event_planners where user_id = auth.uid();
  if found then
    new.organiser_name := p.display_name;
    new.organiser_logo_url := p.logo_url;
  elsif tg_op = 'INSERT' then
    new.organiser_name := null;
    new.organiser_logo_url := null;
  else
    new.organiser_name := old.organiser_name;
    new.organiser_logo_url := old.organiser_logo_url;
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  elsif new.created_by is not null and new.created_by is distinct from auth.uid() then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke execute on function public.events_enforce_organiser() from public, anon, authenticated;

-- ── 5. the edit log ─────────────────────────────────────────────────────
create table if not exists public.staff_edits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  table_name text not null,
  row_id text not null,
  venue_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  /** update: {column: [before, after]} for what changed; insert/delete: the whole row. */
  changes jsonb not null
);
create index if not exists staff_edits_user on public.staff_edits (user_id, created_at desc);
create index if not exists staff_edits_venue on public.staff_edits (venue_id, created_at desc);
alter table public.staff_edits enable row level security;
revoke all on public.staff_edits from anon, authenticated;

create or replace function public.log_staff_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  diff jsonb;
  rid text;
  vid uuid;
begin
  if auth.uid() is null or public.is_admin() or not public.is_staff() then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value))
      into diff
      from jsonb_each(to_jsonb(new)) n(key, value)
      join jsonb_each(to_jsonb(old)) o(key, value) using (key)
      where n.value is distinct from o.value and n.key not in ('updated_at');
    if diff is null then return null; end if;
  elsif tg_op = 'INSERT' then
    diff := to_jsonb(new);
  else
    diff := to_jsonb(old);
  end if;

  rid := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id');
  vid := case tg_table_name
    when 'venues' then rid::uuid
    else nullif(coalesce(to_jsonb(new) ->> 'venue_id', to_jsonb(old) ->> 'venue_id'), '')::uuid
  end;

  insert into public.staff_edits (user_id, table_name, row_id, venue_id, action, changes)
  values (auth.uid(), tg_table_name, rid, vid, lower(tg_op), diff);
  return null;
end;
$$;
revoke execute on function public.log_staff_edit() from public, anon, authenticated;

drop trigger if exists zz_log_staff_edit on public.venues;
create trigger zz_log_staff_edit after insert or update or delete on public.venues
  for each row execute function public.log_staff_edit();
drop trigger if exists zz_log_staff_edit on public.menu_items;
create trigger zz_log_staff_edit after insert or update or delete on public.menu_items
  for each row execute function public.log_staff_edit();
drop trigger if exists zz_log_staff_edit on public.events;
create trigger zz_log_staff_edit after insert or update or delete on public.events
  for each row execute function public.log_staff_edit();
