-- Nudges: what's on this weekend, what's new this week, and "it's been a
-- while" (owner, 30 Oct 2026: "so that people dont forget the app is there").
--
-- These are promotional, so they go only to people who turned them on in the
-- app, and the app lets them turn them off again (App Store guideline 4.5.4).
-- Plan reminders and birthday greetings are not affected.
--
-- notification_prefs: one row per person, written by the person from the app.
-- nudge_sends: one row per person per nudge per period, claimed before the
-- push goes out, so the primary key is what stops a second send (the same
-- rule as plan_notifications). Service role only.

create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nudges boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.notification_prefs is
  'What a person has chosen to be sent beyond plan reminders. nudges: weekend ideas, new this week, it''s been a while. Off until they turn it on.';

alter table public.notification_prefs enable row level security;

drop policy if exists "notification prefs: own read" on public.notification_prefs;
create policy "notification prefs: own read" on public.notification_prefs
  for select using (auth.uid() = user_id);
drop policy if exists "notification prefs: own insert" on public.notification_prefs;
create policy "notification prefs: own insert" on public.notification_prefs
  for insert with check (auth.uid() = user_id);
drop policy if exists "notification prefs: own update" on public.notification_prefs;
create policy "notification prefs: own update" on public.notification_prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.nudge_sends (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('weekend', 'new', 'lapsed')),
  -- The week or day it belongs to, e.g. '2026-10-30': one of each kind per period.
  period text not null,
  title text not null,
  body text not null,
  url text,
  -- How many devices it reached, for telling quiet from broken.
  delivered int not null default 0,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, period)
);

comment on table public.nudge_sends is
  'Every nudge sent (src/lib/nudges.ts), claimed before the push. Read by the cron for its caps; no client access.';

create index if not exists nudge_sends_user_sent on public.nudge_sends (user_id, sent_at desc);

-- No policies: only the service role reads or writes it.
alter table public.nudge_sends enable row level security;
