-- A booking link, and events that describe themselves.
--
-- ── 1. The third way to book ────────────────────────────────────────────
-- Reserving currently tries WhatsApp, then a phone call, then gives up and
-- logs the request for somebody to chase. That covers a restaurant. It does
-- not cover the places that already sell tickets: a conference with a
-- registration page, a padel court with a booking system, a festival on
-- Eventbrite. For those, handing somebody a phone number is worse than the
-- link they were always going to end up at.
alter table public.venues
  add column if not exists booking_url text;

comment on column public.venues.booking_url is
  'Where this venue actually takes bookings, if it takes them online. Preferred over WhatsApp and phone when present, because it is the channel the venue itself chose. Null means they do not book online, which is not the same as not taking bookings.';

-- Readable by everyone, like every other public venue field. It must also go
-- into PUBLIC_VENUE_COLUMNS in src/lib/venueColumns.ts: `select *` on this
-- table has been broken since 0014, so a column nobody names is a column
-- nobody reads.
grant select (booking_url) on public.venues to anon;
grant select (booking_url) on public.venues to authenticated;

-- ── 2. Events say what they are like ────────────────────────────────────
-- A venue has vibe_tags and the planner weighs them. An event pinned to that
-- venue borrowed the venue's, which is wrong in the case that matters: a
-- warehouse is not "loud" on a Tuesday and is on the night of the rave, and
-- the whole reason to plan around an event is that it changes the evening.
alter table public.events
  add column if not exists vibe_tags text[] not null default '{}';

comment on column public.events.vibe_tags is
  'What this night is like, as distinct from what the venue is usually like. Empty means nobody said, and the planner falls back to the venue''s own tags rather than assuming the event is characterless.';

-- Some events are ticketed or seated, and the venue's answer is not theirs.
alter table public.events
  add column if not exists reservation_required boolean not null default false;

alter table public.events
  add column if not exists booking_url text;

comment on column public.events.booking_url is
  'Where to book this particular night. Takes precedence over the venue''s own link: a ticketed event at a restaurant is not booked through the restaurant.';

create index if not exists events_vibe_idx on public.events using gin (vibe_tags);

-- No grants needed on events. 0038 granted insert, update and delete on the
-- whole table, and a table-level privilege covers columns added later.

-- ── 3. The allow-list has to know about booking_url ─────────────────────
--
-- This is the part that is easy to miss, and 0047 is the reason it exists.
--
-- Adding a column to venues no longer makes it writable by a venue, even with
-- a grant, because 0047 rebuilds the row from OLD and copies across only the
-- columns on its list. That was the whole point -- "a column added later is
-- admin-only until somebody decides otherwise" -- and this is somebody
-- deciding otherwise. Without this the portal's booking-link field would save
-- nothing at all and say it had saved.
--
-- The list below is 0047's, plus booking_url. Everything else is unchanged.
create or replace function public.venues_enforce_portal_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[] := array[
    'description',
    'phone',
    'whatsapp_phone',
    'booking_url',
    'instagram_handle',
    'image_url',
    'gallery_urls',
    'opening_periods',
    'opening_hours_text',
    'hours_synced_at',
    'dress_code',
    'reservation_required',
    'is_active',
    'cuisines',
    'cuisine',
    'vibe_tags',
    'best_for',
    'min_party_size',
    'max_party_size',
    'minimum_spend_ghs',
    'avg_cost_per_person_ghs',
    'google_maps_url',
    'lat',
    'lng'
  ];
  merged jsonb;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  select jsonb_object_agg(
           key,
           case when key = any(allowed) then n.value else o.value end
         )
    into merged
    from jsonb_each(to_jsonb(old)) o(key, value)
    join jsonb_each(to_jsonb(new)) n(key, value) using (key);

  new := jsonb_populate_record(old, merged);
  return new;
end;
$$;

revoke execute on function public.venues_enforce_portal_columns() from public;
revoke execute on function public.venues_enforce_portal_columns() from anon, authenticated;

-- A planner creating a location may set it at insert too.
grant insert (booking_url) on public.venues to authenticated;
