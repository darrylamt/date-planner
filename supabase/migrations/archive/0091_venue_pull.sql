-- Each venue's pull: how often people keep it once they are shown it
-- (src/lib/pull.ts, worked out nightly by /api/cron/pull from plan_signals).
--
-- One row per active venue. The counts are decayed (a signal from a month ago
-- counts half), and `effect` is what the planner adds to the venue's score:
-- at most two points either way, less than one vibe tag, plus a small nudge
-- for venues that have hardly been shown, so a new place gets the chance to
-- earn a pull at all.
--
-- The planner reads venue_id and effect, nothing else, so those two columns
-- are public and the counts behind them are not: how often a named restaurant
-- gets swapped out is the venue's business, not every visitor's. Written only
-- by the service role.

create table if not exists public.venue_pull (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  computed_at timestamptz not null default now(),
  /** Plans it appeared in (decayed). */
  shown numeric not null default 0,
  /** Saved or shared in a plan, or Book or Get there tapped (decayed). */
  kept numeric not null default 0,
  /** Swapped out of a plan (decayed). */
  swapped numeric not null default 0,
  /** Menu or details opened (decayed). */
  engaged numeric not null default 0,
  /** Visits to its page, and the middle time spent there, in ms. */
  views integer not null default 0,
  dwell_ms integer,
  /** Kept out of kept-or-swapped, pulled towards the average while evidence is thin. */
  rate numeric,
  /** 0 to 1: how much evidence the rate stands on. */
  confidence numeric not null default 0,
  /** Points added to the venue's score in a plan, -2 to +2.75. */
  effect numeric not null default 0
);

create index if not exists venue_pull_effect on public.venue_pull (effect desc);

alter table public.venue_pull enable row level security;
drop policy if exists "venue_pull: public read" on public.venue_pull;
create policy "venue_pull: public read" on public.venue_pull for select using (true);
revoke all on public.venue_pull from anon, authenticated;
grant select (venue_id, effect) on public.venue_pull to anon, authenticated;
