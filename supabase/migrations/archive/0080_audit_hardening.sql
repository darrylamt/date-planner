-- Closes what the 10-11 October security audit found the database letting
-- through. Measured live before writing this: anon and authenticated hold
-- table-level INSERT, UPDATE and DELETE on venues, events, plans,
-- reservation_requests, venue_reports, issue_reports, plan_pickups and
-- menu_item_recommendations, from Supabase's defaults. That is the hole 0047
-- found for venue UPDATE, and it is wider than that one table: a column grant
-- or an API-side rule narrows nothing a direct PostgREST call cannot undo.
--
-- Same approach as 0047, for the same reason: admins write from the browser
-- under their own session, so a revoke narrow enough to stop a stranger stops
-- the admin too. Each rule here is a trigger that knows who is calling.
-- Nothing had been abused when this was written (no stray rows, no odd links).

-- ── who is calling ──────────────────────────────────────────────────────
-- True for a signed-out visitor or an ordinary signed-in account. False for
-- the service role (API routes, crons, scripts), the SQL editor, and admins.
-- auth.uid() alone cannot tell anon from the service role: both are null.
create or replace function public.is_client_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
           in ('anon', 'authenticated')
     and not public.is_admin();
$$;

-- Only ever called from the security-definer triggers below.
revoke execute on function public.is_client_caller() from public, anon, authenticated;

-- ── 1. A suspended planner loses their venues too ───────────────────────
-- 0046 calls event_planners.is_active the kill switch, but only
-- is_event_planner() read it. The venue_users rows a planner got for the
-- places they added kept every 0038 policy working after suspension.
create or replace function public.manages_venue(v uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.venue_users
    where user_id = auth.uid() and venue_id = v
  )
  and not exists (
    select 1 from public.event_planners
    where user_id = auth.uid() and not is_active
  );
$$;

-- ── 2. Planners add places through the API only ─────────────────────────
-- /api/planner/place inserts with the service role after checking Google and
-- is_active; nothing inserts venues as a planner directly. The policy only
-- let a planner skip those checks and set withheld columns, menu_shared_from
-- included, which opens another venue's menu to them (see 0047).
drop policy if exists "venues: planner insert" on public.venues;

-- ── 3. Booking requests ─────────────────────────────────────────────────
-- Insert: anyone may still lodge one (plans are built signed-out), but as
-- themselves, as a new request, dated in the coming year, timestamped now.
create or replace function public.reservation_requests_enforce_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_client_caller() then
    return new;
  end if;
  new.user_id := auth.uid();
  new.status := 'requested';
  new.created_at := now();
  if new.reservation_date < current_date or new.reservation_date > current_date + 366 then
    raise exception 'reservation_date must be within the coming year' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Update: a venue confirms or declines; it does not rewrite who, when or how
-- many. 0038's `grant update (status)` meant that and never enforced it.
create or replace function public.reservation_requests_enforce_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text := new.status;
begin
  if not public.is_client_caller() then
    return new;
  end if;
  new := old;
  new.status := next_status;
  return new;
end;
$$;

revoke execute on function public.reservation_requests_enforce_insert() from public, anon, authenticated;
revoke execute on function public.reservation_requests_enforce_update() from public, anon, authenticated;

drop trigger if exists reservation_requests_enforce_insert on public.reservation_requests;
create trigger reservation_requests_enforce_insert
  before insert on public.reservation_requests
  for each row execute function public.reservation_requests_enforce_insert();

drop trigger if exists reservation_requests_enforce_update on public.reservation_requests;
create trigger reservation_requests_enforce_update
  before update on public.reservation_requests
  for each row execute function public.reservation_requests_enforce_update();

-- Venues see their bookings, not the guest's account id. The id was the one
-- thing a partner needed to aim RevenueCat events at a customer.
-- Admin pages read through the service role and are unaffected.
revoke select on public.reservation_requests from anon, authenticated;
grant select (id, venue_id, venue_name, plan_slug, party_size, reservation_date,
              arrival_time, guest_name, status, channel, created_at)
  on public.reservation_requests to authenticated;

-- ── 4. Venue reports and problem reports ────────────────────────────────
-- Both are public inserts by design. What a stranger may not choose is the
-- reporter, the status, the review fields or the timestamp. A phone report
-- inserted as 'dismissed' used to raise phone_report_count unseen.
create or replace function public.reports_enforce_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_client_caller() then
    return new;
  end if;
  new.reporter_id := auth.uid();
  new.status := 'open';
  new.created_at := now();
  new.reviewed_at := null;
  new.reviewed_by := null;
  return new;
end;
$$;

-- issue_reports also carries context, which the admin queue renders as text.
-- /api/issues sends only strings; anything else is dropped here, because one
-- object value took the whole /admin/issues page down.
create or replace function public.issue_reports_clean_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_client_caller() then
    return new;
  end if;
  if jsonb_typeof(new.context) is distinct from 'object' then
    new.context := '{}'::jsonb;
  else
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      into new.context
      from jsonb_each(new.context)
     where jsonb_typeof(value) = 'string' and length(value #>> '{}') <= 2000;
  end if;
  return new;
end;
$$;

revoke execute on function public.reports_enforce_insert() from public, anon, authenticated;
revoke execute on function public.issue_reports_clean_context() from public, anon, authenticated;

-- BEFORE triggers fire in name order; both of these run before
-- bump_phone_report's AFTER trigger, so it only ever counts open rows.
drop trigger if exists venue_reports_enforce_insert on public.venue_reports;
create trigger venue_reports_enforce_insert
  before insert on public.venue_reports
  for each row execute function public.reports_enforce_insert();

drop trigger if exists issue_reports_enforce_insert on public.issue_reports;
create trigger issue_reports_enforce_insert
  before insert on public.issue_reports
  for each row execute function public.reports_enforce_insert();

drop trigger if exists issue_reports_clean_context on public.issue_reports;
create trigger issue_reports_clean_context
  before insert on public.issue_reports
  for each row execute function public.issue_reports_clean_context();

-- ── 5. Dish recommendations are judged at the dish's own venue ──────────
-- judge_recommendation (0064) looks for a visit at new.venue_id, which the
-- caller chose freely, and its 20-a-day cap trusts new.created_at. Bind both
-- before it runs: `bind` sorts before `judge`.
create or replace function public.menu_item_recommendations_bind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_venue uuid;
begin
  new.created_at := now();
  select venue_id into item_venue from public.menu_items where id = new.menu_item_id;
  -- The venue on screen may be a branch reading its owner's menu; keep it then.
  if new.venue_id is distinct from item_venue
     and not exists (select 1 from public.venues
                      where id = new.venue_id and menu_shared_from = item_venue) then
    new.venue_id := item_venue;
  end if;
  return new;
end;
$$;

revoke execute on function public.menu_item_recommendations_bind() from public, anon, authenticated;

drop trigger if exists menu_item_recommendations_bind on public.menu_item_recommendations;
create trigger menu_item_recommendations_bind
  before insert on public.menu_item_recommendations
  for each row execute function public.menu_item_recommendations_bind();

-- ── 6. Pickup orders have no writer ─────────────────────────────────────
-- Nothing in the web or the app inserts plan_pickups, but the owner-write
-- policy let any account (anonymous included) put invented orders, at any
-- price, with any link, on a vendor's orders page.
drop policy if exists "plan pickups: owner write" on public.plan_pickups;
revoke insert, update on public.plan_pickups from anon, authenticated;

-- ── 7. "Hosted by" comes from the planner's own row ─────────────────────
-- 0071 keeps a planner's display name and logo admin-controlled, then let the
-- browser copy them onto each event. Stamp them here instead. A venue login
-- that is not a planner cannot set them; on edit, they stay as they were.
create or replace function public.events_enforce_organiser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  if not public.is_client_caller() then
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

drop trigger if exists events_enforce_organiser on public.events;
create trigger events_enforce_organiser
  before insert or update on public.events
  for each row execute function public.events_enforce_organiser();

-- ── 8. Upload limits on the two unlimited public buckets ────────────────
-- Same limits as images (0036). The app only ever sends jpg or png avatars.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'avatars';

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
 where id = 'gifts';

-- ── 9. Stored links are web links ───────────────────────────────────────
-- Rendered as hrefs in the admin, the vendor portal and the app. A
-- javascript: value would run in whoever clicked it. Checked: no live row
-- fails these. Events are NOT VALID only because they were not measured.
alter table public.venues drop constraint if exists venues_google_maps_url_web;
alter table public.venues add constraint venues_google_maps_url_web
  check (google_maps_url is null or google_maps_url = '' or google_maps_url ~* '^https?://');

alter table public.venues drop constraint if exists venues_booking_url_web;
alter table public.venues add constraint venues_booking_url_web
  check (booking_url is null or booking_url = '' or booking_url ~* '^https?://');

alter table public.events drop constraint if exists events_booking_url_web;
alter table public.events add constraint events_booking_url_web
  check (booking_url is null or booking_url = '' or booking_url ~* '^https?://') not valid;

alter table public.plan_pickups drop constraint if exists plan_pickups_reference_image_url_web;
alter table public.plan_pickups add constraint plan_pickups_reference_image_url_web
  check (reference_image_url is null or reference_image_url = '' or reference_image_url ~* '^https?://');
