-- Did the plan feel like the vibe they asked for?
--
-- People say the vibe they pick is not what they get, and until now nothing
-- recorded it: only 23 plans had ever been saved, so most of what the planner
-- hands out was never seen again. Asked under every generated plan that named
-- a vibe, one tap, with an optional line saying why.
--
-- Written only by /api/vibe-feedback with the service role. No grants and no
-- policies for anon or authenticated, so nothing here can be forged straight
-- through PostgREST -- the lesson of 0080.

create table if not exists public.vibe_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /** Set when they were signed in. Anonymous answers count just the same. */
  user_id uuid references auth.users (id) on delete set null,
  /** The per-install id the reports use; one answer per device per plan. */
  device_id text not null,
  /** Made by the app for each plan it shows, so a changed answer replaces the first. */
  plan_key text not null,

  vibes text[] not null,
  occasion text,
  /** The stops they were shown, in order. */
  venue_ids uuid[] not null default '{}',
  /** How many of those stops carried a tag for the vibe, when they answered. */
  matching_stops int,

  fits boolean not null,
  reason text check (reason is null or length(reason) <= 500),

  unique (device_id, plan_key)
);

create index if not exists vibe_feedback_created_idx on public.vibe_feedback (created_at desc);

alter table public.vibe_feedback enable row level security;
revoke all on public.vibe_feedback from anon, authenticated;

comment on table public.vibe_feedback is
  'One answer per device per generated plan to "does this feel <vibe>?". Written by /api/vibe-feedback only. See migration 0081.';
