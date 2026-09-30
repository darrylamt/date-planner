-- The poll for aduro's new name.
--
-- One row a vote: the option picked, the name typed when it was "Other", and
-- any suggestion for the app. No account. voter_hash is a one-way hash of the
-- network address and browser, salted with a server secret, kept only so one
-- device cannot vote a hundred times; it cannot be turned back into either.
--
-- Written and read by the server only (service role), through /api/poll,
-- which hands the public nothing but the counts.

create table if not exists public.name_poll_votes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  choice text not null check (choice in ('Duro!', 'Outy', 'Outly', 'Hang!', 'Other')),
  other_name text check (other_name is null or char_length(other_name) between 1 and 40),
  suggestion text check (suggestion is null or char_length(suggestion) <= 1000),
  voter_hash text not null
);

create index if not exists name_poll_votes_voter_idx on public.name_poll_votes (voter_hash, created_at desc);

alter table public.name_poll_votes enable row level security;
revoke all on public.name_poll_votes from anon, authenticated;

-- A name typed under "Other" joins the poll for everybody after, with its
-- votes. An admin can take one down: its key (lower case, letters and digits
-- only) goes here, and the poll stops showing it. Its votes are kept.
create table if not exists public.name_poll_hidden (
  name_key text primary key,
  created_at timestamptz not null default now()
);

alter table public.name_poll_hidden enable row level security;
revoke all on public.name_poll_hidden from anon, authenticated;
