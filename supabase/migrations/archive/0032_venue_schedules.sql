-- What a place does on a given day of the week.
--
-- Karaoke every Thursday from seven, a live band on Friday, ladies' night on
-- Wednesday. These are the reason somebody picks one bar over another on one
-- particular evening, and the catalogue had no way to say them.
--
-- ── why not the events table ────────────────────────────────────────────
-- `events` holds dated one-offs: a gig on the twentieth, a sip-and-paint on a
-- Saturday in March. A weekly fixture in that shape means one row per week
-- forever, and somebody remembering to add next month's before it arrives.
--
-- These are also a different kind of fact. A one-off is something happening in
-- the city, which is why events carries an area_id and a nullable venue_id. A
-- fixture is a property of the venue itself, like its opening hours, and it
-- belongs on the venue for the same reason they do.
--
-- ── shape, borrowed from opening_periods ────────────────────────────────
-- Weekday 0 is Sunday, matching Google's periods, JavaScript's getDay(), and
-- hours.ts, so the three never need reconciling. Times are minutes from
-- midnight, and an end at or before the start means it runs into the next day:
-- karaoke from 21:00 to 01:00 is one fixture, not two. That is exactly how
-- windows() in hours.ts already reads an opening period, so a Thursday night
-- that ends on Friday morning needs no special case anywhere.

create table if not exists public.venue_schedules (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,

  /** 0 is Sunday. Same convention as opening_periods and hours.ts. */
  weekday smallint not null check (weekday between 0 and 6),

  /** Minutes from midnight. */
  starts_minute smallint not null check (starts_minute between 0 and 1439),
  /**
   * At or before starts_minute means it runs past midnight, which is the
   * common case for the things this table exists to record.
   */
  ends_minute smallint not null check (ends_minute between 0 and 1439),

  /** What it is, in the venue's own words: "Karaoke", "Live highlife band". */
  title text not null check (length(btrim(title)) > 0),

  /**
   * What it costs to get in on that night, when it is not the usual.
   *
   * Null means no cover, or nobody has recorded one. Left out of every total
   * the planner computes until somebody decides which of those two it is,
   * because charging a plan for a door fee we are guessing at is the same
   * mistake as inventing a menu price.
   */
  cover_ghs numeric(10,2) check (cover_ghs is null or cover_ghs >= 0),

  notes text,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venue_schedules_venue_day_idx
  on public.venue_schedules (venue_id, weekday)
  where is_active;

drop trigger if exists venue_schedules_touch on public.venue_schedules;

create trigger venue_schedules_touch
  before update on public.venue_schedules
  for each row execute function public.touch_updated_at();

-- ── who may read and write ──────────────────────────────────────────────
alter table public.venue_schedules enable row level security;

drop policy if exists "venue schedules: public read" on public.venue_schedules;
drop policy if exists "venue schedules: admin write" on public.venue_schedules;
drop policy if exists "venue schedules: admin update" on public.venue_schedules;
drop policy if exists "venue schedules: admin delete" on public.venue_schedules;

/*
 * Catalogue, so it reads like the catalogue: anyone may see what is on at a
 * bar on a Thursday, and only an admin may say what that is. No column here is
 * withheld, unlike venues, so a table-level grant is the whole story and there
 * is no list to keep in step in venueColumns.ts.
 */
create policy "venue schedules: public read" on public.venue_schedules
  for select using (is_active or public.is_admin());

create policy "venue schedules: admin write" on public.venue_schedules
  for insert with check (public.is_admin());

create policy "venue schedules: admin update" on public.venue_schedules
  for update using (public.is_admin());

create policy "venue schedules: admin delete" on public.venue_schedules
  for delete using (public.is_admin());

comment on table public.venue_schedules is
  'Weekly fixtures at a venue: karaoke on Thursdays, a band on Fridays. Recurring by weekday, unlike events, which are dated one-offs happening in the city.';
