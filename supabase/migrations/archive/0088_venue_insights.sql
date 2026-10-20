-- What Gemini learned about each venue from its photos, menu and listing,
-- and what it said about each plan (scripts/study-venues.ts, planCheck.ts).
--
-- venue_insights is read by the planner on every plan, so it reads like the
-- menus: public, written only by the service role. Everything in it is about
-- a public place, never about a person. plan_checks is the planner's own
-- record of what the check flagged and what was done, service role only.

create table if not exists public.venue_insights (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  /** Can a table hear itself: quiet, conversational, buzzy or loud. */
  noise text check (noise is null or noise in ('quiet', 'conversational', 'buzzy', 'loud')),
  /** 0 to 10 for each occasion key ({"first_date": 8, "birthday": 4, ...}). */
  occasion_fit jsonb not null default '{}'::jsonb,
  /** Menu item names this place is known for, as they appear on our menu. */
  signature_dishes text[] not null default '{}',
  /** air_conditioned, outdoor_seating, rooftop, sea_view, live_music, good_for_groups, kid_friendly, instagrammable, parking. */
  features text[] not null default '{}',
  /** How much there was to go on: photos and a menu is high, a name and a type is low. */
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  /** One sentence on what the read is based on, for the admin. */
  basis text check (basis is null or char_length(basis) <= 400),
  model text,
  /** A hash of what was read, so an unchanged venue is not studied again. */
  inputs_hash text,
  studied_at timestamptz not null default now()
);

alter table public.venue_insights enable row level security;
drop policy if exists "venue_insights: public read" on public.venue_insights;
create policy "venue_insights: public read" on public.venue_insights for select using (true);
revoke insert, update, delete on public.venue_insights from anon, authenticated;
grant select on public.venue_insights to anon, authenticated;

create table if not exists public.plan_checks (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  occasion text,
  /** good, flagged, or skipped when the check did not answer in time. */
  verdict text not null check (verdict in ('good', 'flagged', 'skipped')),
  problems jsonb not null default '[]'::jsonb,
  /** kept, replanned (a better plan replaced it) or replan_failed (kept anyway). */
  action text not null check (action in ('kept', 'replanned', 'replan_failed')),
  model text,
  ms integer
);

create index if not exists plan_checks_recent on public.plan_checks (created_at desc);
alter table public.plan_checks enable row level security;
revoke all on public.plan_checks from anon, authenticated;
