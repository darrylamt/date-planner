-- A venue can maintain its own listing.
--
-- Every fact in this catalogue has been typed by one person. That does not
-- scale and, more to the point, it does not get better: 185 of 185 venues have
-- no photograph, 169 have no kitchen recorded and 134 have no description. The
-- venues have all three already, and are wrong in Google Maps too and know it.
--
-- ── the second class of writer ──────────────────────────────────────────
-- Until now writing to the catalogue meant being an admin, and admin is a flag
-- on a profile row. A venue user is not an admin and must never become one:
-- they may edit exactly the venue they run, and nothing else in the database.
--
-- The mechanism is the one migration 0023 established and this file leans on
-- entirely: RLS picks the row, column grants pick the column. A venue user is
-- `authenticated` as far as Postgres is concerned, exactly like every app
-- user, so the column grants below are granted to `authenticated` as a whole
-- and the policy is what stops an ordinary user reaching any row. Both halves
-- are load-bearing. Grant a column without the policy and every signed-in
-- account can edit every venue; write the policy without the grant and the
-- portal silently saves nothing.

-- ── 1. Who runs what ────────────────────────────────────────────────────
create table if not exists public.venue_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  /*
   * What they type to sign in, without the synthetic domain.
   *
   * Venues get a username rather than an email because most have no address
   * they check and the ones that do share it with everybody. Supabase requires
   * an email, so the portal appends a domain that receives no mail; that is a
   * deliberate dead end, because a portal account must not be able to start a
   * password reset by email. An admin reissues instead.
   */
  username text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (user_id, venue_id)
);

comment on table public.venue_users is
  'Links a login to the venue or venues it may edit. One user can run several, which is how a group with branches works.';

create index if not exists venue_users_user_idx on public.venue_users (user_id);
create index if not exists venue_users_venue_idx on public.venue_users (venue_id);

alter table public.venue_users enable row level security;

/*
 * SECURITY DEFINER because the policies below call it while deciding whether
 * the caller may read venue_users itself, and a policy that queries its own
 * table through RLS recurses. Locked to the caller's own uid inside, so it
 * cannot be used to ask about anybody else.
 */
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
  );
$$;

-- PostgREST exposes every function in public as an RPC. Same fix as 0012.
revoke execute on function public.manages_venue(uuid) from public;
grant execute on function public.manages_venue(uuid) to authenticated;

-- A venue user sees their own links and nothing else. Every write is an admin
-- or the service role, because a row here is a grant of access.
create policy "venue_users: own read" on public.venue_users
  for select using (user_id = auth.uid() or public.is_admin());
create policy "venue_users: admin write" on public.venue_users
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 2. Calls and WhatsApp are different numbers ─────────────────────────
-- The reservation flow has always opened wa.me with whatever was in `phone`,
-- on the assumption that a Ghanaian mobile is a WhatsApp number. Mostly it is
-- not: most of these are lines somebody answers. Sending a booking request
-- into a WhatsApp account that does not exist fails silently, which is the
-- worst way for a reservation to fail.
--
-- So two fields. `phone` keeps its meaning and its approval gate: the number
-- to ring. `whatsapp_phone` is for the venues that do take bookings that way,
-- and null means they do not, which is why the app now offers a call instead
-- of pretending.
alter table public.venues
  add column if not exists whatsapp_phone text;

comment on column public.venues.whatsapp_phone is
  'The number that takes WhatsApp bookings, when the venue has one. Null means they do not, which is not the same as having no phone at all: ring public.venues.phone instead.';

grant select (whatsapp_phone) on public.venues to anon;
grant select (whatsapp_phone) on public.venues to authenticated;

-- ── 3. What a venue may change about itself ─────────────────────────────
-- Deliberately a list rather than "everything except". A column added later is
-- then admin-only until somebody decides otherwise, which is the safe default
-- for a table this one is.
--
-- Withheld on purpose, and why:
--   area_id          decides which plans a venue appears in at all
--   price_band       the same, through the budget bands
--   aesthetics       our editorial judgement, not theirs
--   menu_shared_from moving it would take another venue's menu
--   price_source     says how much to trust a price; not a self-assessment
--   is_free          a claim that lets a stop legitimately total zero
--   phone_pending and every phone_* gate column: see below
create policy "venues: own venue update" on public.venues
  for update using (public.manages_venue(id)) with check (public.manages_venue(id));

grant update (
  description,
  phone,
  whatsapp_phone,
  instagram_handle,
  image_url,
  gallery_urls,
  opening_periods,
  opening_hours_text,
  hours_synced_at,
  dress_code,
  reservation_required,
  is_active,
  cuisines,
  cuisine,
  vibe_tags,
  best_for,
  min_party_size,
  max_party_size,
  minimum_spend_ghs,
  avg_cost_per_person_ghs,
  google_maps_url,
  lat,
  lng
) on public.venues to authenticated;

/*
 * The phone gate, and why a venue is allowed through it.
 *
 * Migrations 0013, 0014 and 0028 exist because a number that propagates
 * automatically is fraud committed under our name: the reservation flow hands
 * a user to that number with a message signed "sent via aduro". Only an admin
 * could approve one, because every other writer was guessing.
 *
 * A venue editing its own number is not guessing. It is the authoritative
 * source, and making it queue behind an admin would mean a restaurant that
 * changed its line last week still cannot be reached this week. So a venue
 * user writes `phone` directly and it is live.
 *
 * phone_pending stays out of the grant entirely, so the queue is still the
 * only route for everybody else, and phone_status is set by the trigger below
 * rather than by the writer, so a venue cannot mark somebody else's number
 * approved by writing to a column.
 */
create or replace function public.venue_phone_self_approves()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only when the number actually changed, so an unrelated edit does not
  -- restamp the approval and lose who approved it and when.
  if new.phone is distinct from old.phone and public.manages_venue(new.id) then
    new.phone_status := 'approved';
    new.phone_source := 'the venue, through its own portal';
    new.phone_approved_at := now();
    new.phone_approved_by := auth.uid();
    -- A number the venue has just confirmed settles any outstanding report.
    new.phone_reported_at := null;
    new.phone_report_count := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists venues_phone_self_approve on public.venues;
create trigger venues_phone_self_approve
  before update of phone on public.venues
  for each row execute function public.venue_phone_self_approves();

revoke execute on function public.venue_phone_self_approves() from public;
revoke execute on function public.venue_phone_self_approves() from anon, authenticated;

-- ── 4. Menus: one item at a time, and which branches it is on ───────────
-- A branch shares its owner's menu, held once on the owner row, which is right
-- for the ninety percent of a list that is the same everywhere. It is wrong
-- for the dish only the Osu kitchen does.
--
-- No schema change is needed for that, only a change in how a menu is read: an
-- item written on the owner row is on every branch, and an item written on a
-- branch row is on that branch alone. The portal chooses which by choosing
-- which venue_id to write, and the planner merges the two lists.
--
-- So the policy has to allow both: a venue user may write items on the venue
-- they run, and on the venue it borrows its menu from.
create or replace function public.manages_menu_of(v uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.manages_venue(v)
    -- The owner row, reachable by anybody who runs a branch that borrows it.
    or exists (
      select 1
      from public.venues b
      where b.menu_shared_from = v
        and public.manages_venue(b.id)
    );
$$;

revoke execute on function public.manages_menu_of(uuid) from public;
grant execute on function public.manages_menu_of(uuid) to authenticated;

create policy "menu_items: venue write" on public.menu_items
  for all using (public.manages_menu_of(venue_id))
  with check (public.manages_menu_of(venue_id));

grant insert, update, delete on public.menu_items to authenticated;

-- ── 5. Fixtures and events ──────────────────────────────────────────────
create policy "venue_schedules: venue write" on public.venue_schedules
  for all using (public.manages_venue(venue_id))
  with check (public.manages_venue(venue_id));

grant insert, update, delete on public.venue_schedules to authenticated;

-- An event must be at a venue the writer runs. Events with no venue are
-- city-wide listings and stay an admin's job, which the null check enforces:
-- manages_venue(null) is false, so a venue user cannot create one.
create policy "events: venue write" on public.events
  for all using (public.manages_venue(venue_id))
  with check (public.manages_venue(venue_id));

grant insert, update, delete on public.events to authenticated;

-- ── 6. The reservations inbox ───────────────────────────────────────────
-- The reason to log in twice. 0002 already anticipated this: "this table is
-- the spine of a future venue-facing portal (venues confirm/decline from their
-- own view)."
create policy "reservations: venue read" on public.reservation_requests
  for select using (public.manages_venue(venue_id));

create policy "reservations: venue update" on public.reservation_requests
  for update using (public.manages_venue(venue_id))
  with check (public.manages_venue(venue_id));

-- Status only. A venue confirming a booking must not be able to rewrite who
-- is coming, when, or how many of them.
grant update (status) on public.reservation_requests to authenticated;
grant select on public.reservation_requests to authenticated;
