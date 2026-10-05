-- Somewhere to put a venue in front of people, outside the plan.
--
-- ── why this is not part of the planner ─────────────────────────────────
-- The planner is deterministic and its honesty is the whole product: a stop
-- is chosen because it fits the budget, the hours, the party and the vibe,
-- and for no other reason. The moment a venue can buy its way into an
-- itinerary, an itinerary stops being an answer and becomes an advert that
-- happens to be shaped like one, and nobody can tell which by looking.
--
-- So placement lives here instead, on the home screen, where it is visible as
-- placement. That is the only version of selling attention that does not cost
-- the thing being sold.
--
-- is_paid is on the row for the same reason. Somewhere we picked because we
-- like it and somewhere that paid to be there are different claims, and the
-- card says which. A boolean nobody reads would be worse than not having it,
-- so the app renders "Promoted" from this and the admin cannot turn that off.
--
-- ── dates rather than a week number ─────────────────────────────────────
-- "Featured this week" is what it is called, not what it is. A run that starts
-- on a Thursday because that is when the venue's event is, or one that covers
-- a fortnight, are both ordinary, and a week number cannot say either. The app
-- asks for what is live today.

create table if not exists public.featured_venues (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  /** One line on why this one, in our own words. Null falls back to the venue's description. */
  headline text,
  /**
   * They paid for the slot. Shown to the reader as "Promoted", always.
   */
  is_paid boolean not null default false,
  /** Lower first. Ties break on the venue's name so the order is never random. */
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint featured_venues_dates check (ends_on >= starts_on)
);

comment on table public.featured_venues is
  'Paid or editorial placement on the home screen. Deliberately never read by the planner: a stop is chosen on fit alone.';

-- The app's only query: what is live today, in order.
create index if not exists featured_venues_window_idx
  on public.featured_venues (starts_on, ends_on);

alter table public.featured_venues enable row level security;

-- Public read, admin write. A venue cannot feature itself, which is the point:
-- this is a slot somebody gives out, not a field somebody fills in.
create policy "featured: public read" on public.featured_venues
  for select using (true);
create policy "featured: admin write" on public.featured_venues
  for all using (public.is_admin()) with check (public.is_admin());
