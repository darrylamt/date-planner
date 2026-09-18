-- A birthday, so we can say so.
--
-- ── why the day and month, and not the year ─────────────────────────────
-- The only thing this is for is knowing which morning to send a message on.
-- A full date of birth is an identity document's worth of information, useful
-- for age-gating and for nothing else here, and asking for what you do not
-- need is how a nice touch becomes a privacy disclosure nobody wanted.
--
-- So two small integers rather than a date. It cannot be mistaken for an age,
-- it cannot be used to guess at one, and there is no year to leak. It also
-- sidesteps the leap-day question honestly: 29 February is stored as it is
-- given and greeted on the 28th in years that have no 29th, which is what
-- people do themselves.
--
-- Optional, always. Nobody is asked for it during signup: it lives on the
-- profile beside the sentence explaining what it is for, because a date of
-- birth demanded at the door reads as data collection and the same field
-- offered next to "we will wish you happy birthday" reads as a reason.

alter table public.profiles
  add column if not exists birth_day smallint
    check (birth_day is null or birth_day between 1 and 31),
  add column if not exists birth_month smallint
    check (birth_month is null or birth_month between 1 and 12);

comment on column public.profiles.birth_day is
  'Day of the month only. There is deliberately no year: this exists to pick a morning to send a greeting, and a full date of birth is more than that needs.';

-- Both halves or neither, because half a birthday is not a date and would
-- otherwise sit there looking like one.
alter table public.profiles
  drop constraint if exists profiles_birthday_complete;
alter table public.profiles
  add constraint profiles_birthday_complete
  check ((birth_day is null) = (birth_month is null));

/*
 * The job reads this every morning across every account, so it reads one small
 * index rather than a hundred thousand rows. Partial, because the answer is
 * always "the few who have told us".
 */
create index if not exists profiles_birthday_idx
  on public.profiles (birth_month, birth_day)
  where birth_day is not null;

-- Sent once a year, enforced the same way plan reminders are: the primary key
-- is the guard, and a repeat insert failing IS the answer rather than an error
-- to reason about at six in the morning.
create table if not exists public.birthday_greetings (
  user_id uuid not null references auth.users (id) on delete cascade,
  year smallint not null,
  sent_at timestamptz not null default now(),
  delivered int not null default 0,
  primary key (user_id, year)
);

alter table public.birthday_greetings enable row level security;
-- No policy, deliberately: RLS on with none denies everybody, which is right
-- for a table only the cron job touches.

/*
 * 0023 already wrote the own-row policy and explained why the column grant is
 * the load-bearing half: a policy alone would let anyone set is_admin on their
 * own row, so the grant is the list of what may be written and the policy only
 * decides which row. Two more columns join that list; is_admin emphatically
 * does not.
 */
grant update (birth_day, birth_month) on public.profiles to authenticated;
