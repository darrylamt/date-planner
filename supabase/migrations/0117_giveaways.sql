-- 0117: ticket giveaways (owner, 20 Nov 2026).
--
-- One free ticket on an event. People who are signed in and have
-- notifications on enter by tapping the event's Tickets button in the app.
-- The Nth to enter wins (win_at_entry, 21 for the first one); everyone else
-- goes on to the normal ticket page. If fewer than N enter by draw_at, one of
-- those who tried is drawn. When it is won, everyone who tried is told by
-- push who won (email masked).
--
-- Only the server reads or writes these (service role): the prize is a real
-- ticket's QR, so no policy lets anyone else near either table.

create table if not exists public.giveaways (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- What is won, in words: "a free ticket to CTRL - Control the Night".
  prize text not null,
  -- The ticket's QR as its exact modules: rows of 0/1 joined by commas,
  -- copied from the ticket itself rather than re-encoded.
  prize_qr text not null,
  -- Where everyone who does not win goes: the event's real ticket page.
  fallback_url text not null,
  win_at_entry int not null default 21 check (win_at_entry > 0),
  draw_at timestamptz not null,
  winner_user_id uuid references auth.users(id) on delete set null,
  -- The secret part of the winner's page address (/win/<token>).
  winner_token text unique,
  won_at timestamptz,
  won_how text check (won_how in ('entry', 'draw')),
  announced_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists giveaways_event_idx on public.giveaways (event_id);

create table if not exists public.giveaway_entries (
  -- Arrival order across all giveaways; position within one is counted from it.
  seq bigint generated always as identity,
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (giveaway_id, user_id)
);

create index if not exists giveaway_entries_order_idx on public.giveaway_entries (giveaway_id, seq);

alter table public.giveaways enable row level security;
alter table public.giveaway_entries enable row level security;

-- No policies: with RLS on and none granted, anon and signed-in users see nothing.
revoke all on public.giveaways from anon, authenticated;
revoke all on public.giveaway_entries from anon, authenticated;
