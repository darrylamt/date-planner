-- One row per Gemini read from a portal account: a menu photo, a poster, a
-- venue suggestion (src/lib/aiAllowance.ts).
--
-- Gemini's free tier is one daily allowance for the whole project, shared by
-- every venue, planner and vendor, so each portal account gets a daily share
-- and one cannot use up the day for the rest. Admins are not limited and not
-- counted. Nothing about what was read is kept: who, which kind, and when.
--
-- Service role only, like every table since 0080: RLS on, everything revoked
-- from anon and authenticated, no policies.

create table if not exists public.ai_reads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('menu', 'flyer', 'venue')),
  created_at timestamptz not null default now()
);

create index if not exists ai_reads_user_day on public.ai_reads (user_id, created_at desc);

alter table public.ai_reads enable row level security;
revoke all on public.ai_reads from anon, authenticated;
