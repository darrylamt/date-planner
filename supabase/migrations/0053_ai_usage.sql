-- What every model call cost, not just the ones that were chat messages.
--
-- messages.usage has recorded input, output, cacheRead and cacheWrite on every
-- assistant turn since chat shipped, and it answers its question well: the
-- assistant's cache hit rate is 57.6% and thirty-three turns cost thirty-one
-- cents. The trouble is that chat is one of four call sites that spend money,
-- and it is the only one that writes any of this down.
--
-- So a $14.52 month could be attributed to the extent of $0.31, and the rest
-- had to be reasoned about by subtraction. The console's own figures are
-- blended across every call site, which is how a 16% cache hit rate -- a
-- number with three uncached callers dragging it down -- read as though the
-- assistant were the problem.
--
-- ── why its own table ───────────────────────────────────────────────────
-- These are not conversation turns. A menu ingest has no conversation_id and
-- never will, and widening messages to hold it would mean a table where half
-- the rows are not messages. This is an operational log: append-only, read by
-- one script and one admin, and safe to delete a year of.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),

  /**
   * Which piece of the app spent it.
   *
   * Free text rather than an enum: a new call site should be able to start
   * logging without a migration, and the cost of a typo here is one wrong row
   * in a report, not a failed write on the user's path.
   */
  call_site text not null,
  model text not null,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,

  /** False when the call threw. A failed call still burns input tokens. */
  ok boolean not null default true,
  /** Wall clock, because latency is the other thing nobody is measuring. */
  duration_ms integer,

  created_at timestamptz not null default now()
);

create index if not exists ai_usage_site_idx on public.ai_usage (call_site, created_at desc);
create index if not exists ai_usage_recent_idx on public.ai_usage (created_at desc);

alter table public.ai_usage enable row level security;

/*
 * Nobody signed in may read this, and nobody at all may write it.
 *
 * It is a spend log. It says nothing about any user, but it says a great deal
 * about what this costs to run, and there is no reason for an app session to
 * be able to ask. Writes come from the server with the service role, which
 * bypasses RLS; with no insert policy, the anon and authenticated roles cannot
 * add rows even if the key leaked.
 */
create policy "ai usage: admin read" on public.ai_usage
  for select using (public.is_admin());

comment on table public.ai_usage is
  'One row per model call, from every call site rather than only chat. Exists because a month billed at $14.52 could be attributed to $0.31 of it, and because a blended cache hit rate hid the fact that the assistant was the only caller caching anything.';
