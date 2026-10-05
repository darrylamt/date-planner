-- Let people say when the app itself is wrong.
--
-- 0009 gave them a way to report a venue: the price moved, the number is dead,
-- the place has shut. That covers the catalogue going stale, which was the
-- only kind of wrong the app had at the time.
--
-- It does not cover the app being broken. Chat spent an unknown stretch
-- telling every user, paying ones included, that they were out of messages for
-- the month -- a renamed function argument the meter fell back from -- and the
-- only reason it was found is that the person who runs aduro hit it himself
-- and said so. Nobody else had anywhere to put it. A venue report form cannot
-- hold "the assistant says my conversation confused it", so that sentence went
-- nowhere.
--
-- ── the same shape as 0009, for the same reasons ────────────────────────
-- No login. The people best placed to report a broken sign-in or a failed
-- purchase are the ones it just happened to, and a form behind an account is
-- shut to exactly them. A device string separates one person tapping twice
-- from two people agreeing. Nothing here changes anything on its own; a report
-- is a flag for a human.

create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),

  /**
   * Which part of the app, in the reporter's terms rather than ours.
   *
   * Coarse on purpose. A person who cannot pay does not know whether that is
   * RevenueCat, App Store Connect or an entitlement row, and asking them to
   * guess produces a worse label than asking nothing. Five buckets is enough
   * to route it to whoever should look.
   */
  area text not null
    check (area in ('chat', 'plan', 'account', 'payment', 'other')),

  /** Their words. The whole point; everything else is scaffolding. */
  message text not null check (length(btrim(message)) > 0),

  /**
   * What the app knew when they tapped: the conversation or plan in hand, the
   * error last shown on screen, the build they are on.
   *
   * This is the difference between "chat is broken" and a conversation id that
   * can be replayed. Gathered by the app rather than typed, because a person
   * describing a bug should not also have to be its reporter of record. Never
   * anything they did not already see.
   */
  context jsonb not null default '{}'::jsonb,

  /** Set when they happened to be signed in. Often they will not be. */
  reporter_id uuid references auth.users (id) on delete set null,
  /** A per-install identifier, not an identity. Same role as in 0009. */
  reporter_device text,

  status text not null default 'open'
    check (status in ('open', 'actioned', 'dismissed')),

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  /** What was done about it, for whoever reads this queue next month. */
  resolution text
);

create index if not exists issue_reports_open_idx
  on public.issue_reports (created_at desc)
  where status = 'open';

create index if not exists issue_reports_area_idx
  on public.issue_reports (area, created_at desc);

/*
 * No one-per-device unique index, unlike 0009.
 *
 * There it is load-bearing: five reports of a closed venue has to mean five
 * people or the count decides nothing. Here the message is free text and two
 * reports from one person are usually two different faults, or the same fault
 * described better the second time. Refusing the second one would throw away
 * the more useful of the pair.
 */

alter table public.issue_reports enable row level security;

-- Anyone can report, including signed out. See above.
create policy "issue reports: public insert" on public.issue_reports
  for insert with check (true);

-- Reporters can see what they filed; admins see and manage everything.
create policy "issue reports: own read" on public.issue_reports
  for select using (auth.uid() = reporter_id or public.is_admin());
create policy "issue reports: admin update" on public.issue_reports
  for update using (public.is_admin());
create policy "issue reports: admin delete" on public.issue_reports
  for delete using (public.is_admin());

comment on table public.issue_reports is
  'Reports about aduro itself, as opposed to venue_reports which is about the catalogue. Open to signed-out reporters on purpose: a broken sign-in or a failed purchase is invisible to a form that requires an account.';
