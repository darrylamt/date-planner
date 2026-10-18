-- Calm by day, lively at night.
--
-- vibe_tags carry one energy (calm, chill or lively) since the October
-- re-tag, because a venue tagged calm AND lively matched both kinds of plan
-- and disappointed one of them. But some places really are both, at
-- different hours: RITUAL is "a café by day and cocktail listening bar by
-- night", and the beach clubs are quiet at lunch and loud at ten.
--
-- vibe_tags now describe the place in the evening, when most plans happen.
-- day_energy, where set, is how it feels before six: src/lib/dayEnergy.ts
-- swaps it in for stops in the day. Null means the same all day.
--
-- Admin-only to write: it is not on the venue portal's allow-list (0047/0048),
-- so a venue cannot change it about itself.

alter table public.venues
  add column if not exists day_energy text
  check (day_energy is null or day_energy in ('calm', 'chill', 'lively'));

comment on column public.venues.day_energy is
  'How the venue feels before 18:00 when that differs from the energy in vibe_tags, which describe the evening. Null: the same all day. See migration 0082.';

-- 0014 revoked table-wide SELECT on venues; every readable column is granted.
grant select (day_energy) on public.venues to anon, authenticated;
