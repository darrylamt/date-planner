-- aduro — venue verification
--
-- The planner only recommends venues from our own table, so a fabricated or
-- closed row becomes a real person standing outside a building that is not
-- there. These columns record whether a row has been checked against the live
-- web, what was found, and when — so unverified rows are visible rather than
-- silently trusted.

create type verification_status as enum (
  'unverified',  -- never checked
  'real',        -- corroborated by citable sources
  'closed',      -- existed, has since shut
  'not_found',   -- no evidence found
  'uncertain'    -- weak or contradictory evidence
);

alter table public.venues
  add column verification_status verification_status not null default 'unverified',
  -- 0..1 as reported by the model. Low confidence on a 'real' verdict still
  -- warrants a human look, which is why it is stored rather than collapsed
  -- into the status.
  add column verification_confidence numeric,
  add column verification_summary text,
  -- [{title, url}] — the pages actually consulted. Without these a verdict is
  -- an assertion, not evidence.
  add column verification_sources jsonb not null default '[]'::jsonb,
  -- Where the stored row disagrees with what was found (dead phone, wrong
  -- area, different canonical name, unsupported price).
  add column verification_discrepancies jsonb not null default '[]'::jsonb,
  add column verified_at timestamptz;

-- The admin catalog view filters on this constantly.
create index venues_verification_idx
  on public.venues (verification_status, verified_at desc nulls first);

comment on column public.venues.verification_status is
  'Result of the last web verification. Never set to real without sources.';
comment on column public.venues.verification_confidence is
  'Model confidence 0..1 for the last verdict.';
comment on column public.venues.verified_at is
  'When the last verification ran. Null means never checked.';
