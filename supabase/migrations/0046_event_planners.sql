-- The people with an event but no address.
--
-- Migration 0038 gave a restaurant a login to the venue it runs. It assumed
-- the venue already existed, because until now every row in this catalogue
-- was typed by an admin first and handed out afterwards.
--
-- An event planner breaks that assumption. Somebody running a night market on
-- a lawn, a sip-and-paint in a borrowed studio or a pop-up in a car park has
-- no listing to be handed, and will not have one next month either, because
-- the place changes with the event. The thing they need to create is the
-- location, and the location exists only because the event does.
--
-- ── why they may create a venue and a restaurant may not ────────────────
-- Accounts are issued to planners we have already verified. That is the whole
-- gate, and it is deliberately a human one: nothing here reviews what they
-- write afterwards, so their location and their event are live the moment
-- they save. An approval queue that nobody empties is worse than no queue,
-- because it reads as a promise of review that is not being kept.
--
-- The kill switch is `event_planners.is_active`. Withdrawing it stops them
-- creating anything new without deleting the account, which would orphan
-- every event they have already run.
--
-- ── the mechanism is 0023's, unchanged ──────────────────────────────────
-- RLS picks the row, column grants pick the column. Both halves are
-- load-bearing here in a way worth saying out loud, because the insert grant
-- below is to `authenticated` as a whole: every signed-in account holds the
-- column privilege, and the policy is the only thing standing between an app
-- user and a venue of their own invention. Drop the policy and anybody can
-- list a venue.

-- ── 1. A number on an event, live the moment it is typed ────────────────
--
-- The argument is 0038's phone argument, applied one table over. Migrations
-- 0013, 0014 and 0028 built the approval queue because a number that
-- propagates automatically is fraud committed under our name: the reservation
-- flow hands a user to that number with a message signed "sent via aduro".
-- Every writer that queue was built for was guessing, because the numbers
-- were read off Instagram and Google Maps.
--
-- The organiser of an event is not guessing. It is their own line, typed by
-- them, for the thing they are running. Making it queue behind an admin means
-- the poster goes up on Tuesday with no way to reach anybody about it, which
-- for a one-night event is the same as having no number at all.
--
-- This is a plain text column and not a venue phone: it does not touch
-- venues.phone, it inherits none of the phone_* gate columns, and a report
-- against it is a report against the event.
alter table public.events
  add column if not exists contact_phone text;

comment on column public.events.contact_phone is
  'Whoever is running this event, in their own words. First-party and so not subject to the venues.phone approval queue: see migration 0046. Null means nobody gave one, which is not the same as the venue having no number.';

-- No grant is needed. Migration 0038 granted insert, update and delete on
-- this table without a column list, and a table-level privilege in Postgres
-- covers columns added later.

-- ── 2. Who is allowed to invent a location ──────────────────────────────
create table if not exists public.event_planners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  /*
   * A username, for the reason 0038 gives: most have no address they check,
   * and the synthetic domain is a deliberate dead end so a portal account
   * cannot start a password reset by email. Shares the venue namespace, so a
   * planner and a venue can never be issued the same name.
   */
  username text not null unique,
  /** Who they are on a poster: "Accra Night Market", not a person's name. */
  display_name text not null,
  contact_phone text,
  /*
   * The kill switch, not a review state. Accounts are created active because
   * verification happened before the account existed; this exists to take one
   * away without deleting what they have already published.
   */
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

comment on table public.event_planners is
  'A login that may create locations and put events at them. Verified by hand before the account is issued; nothing here reviews what they write afterwards.';

alter table public.event_planners enable row level security;

create policy "planners: read own row" on public.event_planners
  for select using (user_id = auth.uid());

grant select on public.event_planners to authenticated;

/*
 * SECURITY DEFINER for the same reason manages_venue is: the venues policy
 * below calls this while deciding an insert, and it must not depend on the
 * caller being able to read event_planners through RLS. Locked to the
 * caller's own uid inside, so it cannot be asked about anybody else.
 */
create or replace function public.is_event_planner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_planners
    where user_id = auth.uid()
      and is_active
  );
$$;

revoke execute on function public.is_event_planner() from public;
grant execute on function public.is_event_planner() to authenticated;

-- ── 3. A link row that is not a login ───────────────────────────────────
--
-- venue_users.username was "what they type to sign in", which was true while
-- every row was a venue's account. A planner's link row is not an account:
-- the account is in event_planners and the username is there, and this row
-- exists only to say which venues that one login may touch. So it has none,
-- and the column stops being required.
--
-- Nulls stay distinct under a unique index, so any number of link rows can
-- carry no username without colliding.
alter table public.venue_users alter column username drop not null;

comment on column public.venue_users.username is
  'The login name, for a venue account. Null on a row created by a planner claiming a location they made: that row is a grant, not an account, and the name lives on event_planners.';

-- ── 4. Creating the location ────────────────────────────────────────────
drop policy if exists "venues: planner insert" on public.venues;
create policy "venues: planner insert" on public.venues
  for insert with check (public.is_event_planner());

/*
 * Deliberately a list, like 0038's update grant, so a column added later is
 * admin-only until somebody decides otherwise.
 *
 * area_id is here and is not in the update grant, which is the point. A new
 * location has to be placed or the planner cannot reach it at all; an
 * existing one must not be movable, because area_id decides which plans a
 * venue appears in and a location that quietly relocates into a busier
 * district is the first thing anybody would try.
 *
 * Withheld on insert as well as update, and why:
 *   price_band        the budget bands; ours to set from what it costs
 *   price_source      says how much to trust a price, not a self-assessment
 *   is_free           a claim that lets a stop legitimately total zero
 *   aesthetics        our editorial judgement
 *   menu_shared_from  would take another venue's menu
 *   every phone_*     the approval queue, untouched
 */
grant insert (
  name,
  type,
  area_id,
  description,
  lat,
  lng,
  google_maps_url,
  image_url,
  gallery_urls,
  instagram_handle,
  phone,
  whatsapp_phone,
  vibe_tags,
  best_for,
  dress_code,
  reservation_required,
  min_party_size,
  max_party_size,
  opening_periods,
  opening_hours_text,
  is_active
) on public.venues to authenticated;

/*
 * The new location belongs to whoever made it.
 *
 * Without this the planner would insert a venue and immediately lose it:
 * manages_venue() reads venue_users, so the row they just created would not
 * be theirs to edit, and nothing else in the portal would show it.
 *
 * Fires on every insert into venues, including an admin's. auth.uid() is null
 * under the service role, so is_event_planner() is false there and this is a
 * no-op for every row an admin creates.
 */
create or replace function public.planner_claims_new_venue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_event_planner() then
    insert into public.venue_users (user_id, venue_id, created_by)
    values (auth.uid(), new.id, auth.uid())
    on conflict (user_id, venue_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.planner_claims_new_venue() from public;
revoke execute on function public.planner_claims_new_venue() from anon, authenticated;

drop trigger if exists venues_planner_claims on public.venues;
create trigger venues_planner_claims
  after insert on public.venues
  for each row execute function public.planner_claims_new_venue();
