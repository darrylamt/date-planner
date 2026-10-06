-- What it costs to get in, on its own.
--
-- is_free means the whole visit costs nothing: a beach, a park, a free
-- museum. A club that is free to enter is not that. People pregame
-- somewhere and walk in without buying anything, but the bar still sells
-- drinks, and ticking is_free told the chat the place was free and let a
-- GHS 0 budget plan a night of clubs.
--
-- ── how it is read ──────────────────────────────────────────────────────
-- Null is "nobody has recorded it", which is not free. Zero is a recorded
-- free entry. Anything else is the usual cover per person. A weekly night
-- with its own cover (venue_schedules.cover_ghs) overrides it for that
-- night, and a dated event's ticket overrides both.
--
-- On a club-hopping plan, the bars after the first are priced by this alone
-- (see optionsForVenue in planner.ts): the first stop is where the drinking
-- happens, the rest are where the dancing does.

alter table public.venues
  add column if not exists entry_fee_ghs numeric(8,2)
  check (entry_fee_ghs is null or entry_fee_ghs >= 0);

comment on column public.venues.entry_fee_ghs is
  'Usual entry per person, in GHS. Null is not recorded, 0 is free entry. A weekly night''s cover_ghs overrides it.';

-- Venues are read through an explicit column grant (see 0014), so a new
-- column is invisible to the app, and to the planner, until it is granted.
grant select (entry_fee_ghs) on public.venues to anon;
grant select (entry_fee_ghs) on public.venues to authenticated;
