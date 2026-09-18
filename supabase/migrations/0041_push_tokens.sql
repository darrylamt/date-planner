-- Where to reach somebody who is not looking at the app.
--
-- The first notification worth sending is the one the night before: "dinner at
-- Buka at six, then Republic". It arrives when the plan is about to matter,
-- needs no data we do not already hold, and nobody experiences it as spam,
-- which is more than can be said for most reasons an app asks for this
-- permission.
--
-- ── one row per device, not per person ──────────────────────────────────
-- A phone and an iPad are two tokens for one account, and a token belongs to
-- an install rather than to a login: reinstall the app and the old one stops
-- working without ever telling us. So the token is the key, the user is a
-- column, and a token that turns out to be dead is deleted rather than
-- reasoned about.
--
-- Expo rotates these. The same device can hand back a different token after an
-- update, which is why registration writes on every launch rather than once,
-- and why the primary key is the token itself: the second write is an upsert
-- that costs nothing rather than a duplicate nobody notices until somebody
-- gets two copies of every notification.

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_tokens is
  'Expo push tokens, one per device. Keyed on the token because it belongs to an install rather than to a login, and a reinstall silently invalidates the old one.';

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

/*
 * Owner only, and the check clause matters as much as the using clause: a user
 * may register a token against themselves and may not park one against
 * somebody else's account, which would send that person's evening to this
 * person's phone.
 */
create policy "push tokens: own read" on public.push_tokens
  for select using (auth.uid() = user_id);
create policy "push tokens: own insert" on public.push_tokens
  for insert with check (auth.uid() = user_id);
create policy "push tokens: own update" on public.push_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push tokens: own delete" on public.push_tokens
  for delete using (auth.uid() = user_id);

-- ── what has already been sent ──────────────────────────────────────────
-- A cron job that runs hourly must not send the same reminder every hour, and
-- "did we already tell them" is not something to infer from timestamps at
-- three in the morning. One row per plan per kind of notification, with the
-- primary key doing the work: the insert fails on the second attempt and that
-- failure IS the answer.
create table if not exists public.plan_notifications (
  plan_id uuid not null references public.plans (id) on delete cascade,
  /** Which reminder. 'eve' is the night before; more will follow. */
  kind text not null,
  sent_at timestamptz not null default now(),
  /** How many devices it actually reached, for telling quiet from broken. */
  delivered int not null default 0,
  primary key (plan_id, kind)
);

comment on table public.plan_notifications is
  'One row per plan per reminder already sent. The primary key is the idempotency guard: a repeat insert fails, which is the answer rather than an error.';

alter table public.plan_notifications enable row level security;

-- Nothing signed in reads or writes this; the cron job runs as the service
-- role. No policy is deliberate: RLS on with no policy denies everybody, which
-- is the correct access level for a table that is purely our own bookkeeping.
