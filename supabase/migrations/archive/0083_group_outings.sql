-- Group outings.
--
-- An organiser starts a group in the app and shares a link; friends answer in
-- the app or on a web page with no account: a name, when they're free, a
-- private budget, vibes, hard no's, where they're coming from. Duro picks the
-- date and one plan whose venues are shared but whose orders are sized to
-- each person's own budget. The organiser locks it into an ordinary saved
-- plan.
--
-- Every table here is written and read only by /api/groups/* with the
-- service role: RLS on, everything revoked from anon and authenticated, no
-- policies. 0080 is why: rules kept only in an API route mean nothing when a
-- client can write the table directly.
--
-- Budgets live apart from members (group_member_secrets) so a query on
-- members can never carry them, and each person's order (group_plan_orders)
-- is read only by plan and member together. Nobody sees another person's
-- budget or order, the organiser included.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  /** 96 random bits from the server (src/lib/groupToken.ts). The only key to the form. */
  code text not null unique check (code ~ '^[A-Za-z0-9_-]{16}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  occasion text not null check (occasion in ('friend_outing', 'birthday', 'celebration', 'graduation')),
  title text check (title is null or char_length(title) <= 80),
  date_from date not null,
  date_to date not null,
  area_hint_id uuid references public.areas (id) on delete set null,
  answer_deadline timestamptz not null,
  expected_count smallint check (expected_count is null or expected_count between 2 and 12),
  max_members smallint not null default 12 check (max_members between 2 and 12),
  status text not null default 'collecting'
    check (status in ('collecting', 'ready', 'planned', 'locked', 'cancelled')),
  /** Bumped on every answer change, so a plan made from older answers cannot be locked. */
  answers_version int not null default 0,
  locked_plan_id uuid references public.plans (id) on delete set null,
  plan_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_to >= date_from and date_to - date_from <= 13)
);
create index if not exists groups_owner_idx on public.groups (owner_id, status, created_at desc);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  /** Set for app answerers and the organiser; null for web answerers. */
  user_id uuid references auth.users (id) on delete cascade,
  is_organiser boolean not null default false,
  /** What the group calls them: fills Who pays and Split the bill. */
  name text not null check (char_length(name) between 1 and 24),
  /** {"2026-11-07": ["day", "evening"], ...} */
  availability jsonb not null default '{}'::jsonb check (jsonb_typeof(availability) = 'object'),
  vibes text[] not null default '{}' check (cardinality(vibes) <= 3),
  hard_nos text[] not null default '{}' check (cardinality(hard_nos) <= 12),
  hard_no_tags text[] not null default '{}' check (cardinality(hard_no_tags) <= 5),
  from_area_id uuid references public.areas (id) on delete set null,
  answered_at timestamptz,
  /** Salted hash of address and browser, for rate limits only (src/lib/rateLimit.ts). */
  fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists group_members_group_idx on public.group_members (group_id);
create unique index if not exists group_members_user_uq
  on public.group_members (group_id, user_id) where user_id is not null;
create unique index if not exists group_members_name_uq on public.group_members (group_id, lower(name));
create index if not exists group_members_fp_idx on public.group_members (fingerprint, created_at desc);

create table if not exists public.group_member_secrets (
  member_id uuid primary key references public.group_members (id) on delete cascade,
  budget_ghs int check (budget_ghs is null or (budget_ghs between 0 and 10000 and budget_ghs % 50 = 0)),
  /** sha256 of the web answerer's edit token; null for app members. */
  edit_token_hash text
);
create unique index if not exists group_member_secrets_token_uq
  on public.group_member_secrets (edit_token_hash) where edit_token_hash is not null;

-- One row per recommendation. v2 voting adds several per round (option_index).
create table if not exists public.group_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  round int not null default 1,
  option_index smallint not null default 0 check (option_index between 0 and 2),
  status text not null default 'proposed' check (status in ('proposed', 'option', 'superseded', 'locked')),
  answers_version int not null,
  /** Merged plan inputs, budget replaced by the shared total. */
  inputs jsonb not null,
  /** What everyone may see: shared costs only, no personal orders. */
  shared_itinerary jsonb not null,
  attending_member_ids uuid[] not null,
  created_at timestamptz not null default now(),
  locked_at timestamptz
);
create index if not exists group_plans_group_idx on public.group_plans (group_id, created_at desc);
create unique index if not exists group_plans_one_locked on public.group_plans (group_id) where status = 'locked';

-- Each person's own order. Read only filtered by plan and member together.
create table if not exists public.group_plan_orders (
  plan_id uuid not null references public.group_plans (id) on delete cascade,
  member_id uuid not null references public.group_members (id) on delete cascade,
  stops jsonb not null,
  shared_ghs int not null,
  personal_ghs int not null,
  rides_ghs int not null,
  total_ghs int not null,
  primary key (plan_id, member_id)
);

-- Claimed before a push goes out, so none is sent twice.
create table if not exists public.group_notifications (
  group_id uuid not null references public.groups (id) on delete cascade,
  kind text not null,
  key text not null default '',
  sent_at timestamptz not null default now(),
  primary key (group_id, kind, key)
);

alter table public.plans add column if not exists group_id uuid references public.groups (id) on delete set null;
create index if not exists plans_group_idx on public.plans (group_id) where group_id is not null;

-- Twelve at most, checked under a lock on the group row so two answers
-- arriving together cannot both take the last place.
create or replace function public.group_members_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
  v_count int;
begin
  select max_members into v_max from public.groups where id = new.group_id for update;
  select count(*) into v_count from public.group_members where group_id = new.group_id;
  if v_count >= v_max then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists group_members_cap on public.group_members;
create trigger group_members_cap before insert on public.group_members
  for each row execute function public.group_members_cap();

create or replace function public.group_answers_bump()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.groups
     set answers_version = answers_version + 1, updated_at = now()
   where id = coalesce(new.group_id, old.group_id);
  return coalesce(new, old);
end;
$$;
drop trigger if exists group_answers_bump on public.group_members;
create trigger group_answers_bump after insert or update or delete on public.group_members
  for each row execute function public.group_answers_bump();

-- A budget change bumps the version too: it changes the orders.
create or replace function public.group_secrets_bump()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.budget_ghs is not distinct from old.budget_ghs then
    return new;
  end if;
  update public.groups g
     set answers_version = g.answers_version + 1, updated_at = now()
    from public.group_members m
   where m.id = coalesce(new.member_id, old.member_id) and g.id = m.group_id;
  return coalesce(new, old);
end;
$$;
drop trigger if exists group_secrets_bump on public.group_member_secrets;
create trigger group_secrets_bump after insert or update on public.group_member_secrets
  for each row execute function public.group_secrets_bump();

-- Active: not cancelled, and the outing (or the end of its range) is today or later.
create or replace function public.group_active_count(p_owner uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.groups
   where owner_id = p_owner
     and status <> 'cancelled'
     and coalesce(plan_date, date_to) >= (now() at time zone 'utc')::date;
$$;

-- Create a group with the free limit checked under a per-owner lock, the way
-- consume_chat_message (0042) meters chat. p_limit null means no limit (Pro).
create or replace function public.group_create(
  p_owner uuid,
  p_code text,
  p_occasion text,
  p_title text,
  p_date_from date,
  p_date_to date,
  p_area_hint uuid,
  p_deadline timestamptz,
  p_expected smallint,
  p_name text,
  p_limit int
)
returns table (group_id uuid, member_id uuid, active int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active int;
  v_group uuid;
  v_member uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('group_create:' || p_owner::text, 0));
  v_active := public.group_active_count(p_owner);
  if p_limit is not null and v_active >= p_limit then
    return query select null::uuid, null::uuid, v_active;
    return;
  end if;
  insert into public.groups (code, owner_id, occasion, title, date_from, date_to, area_hint_id, answer_deadline, expected_count)
  values (p_code, p_owner, p_occasion, p_title, p_date_from, p_date_to, p_area_hint, p_deadline, p_expected)
  returning id into v_group;
  insert into public.group_members (group_id, user_id, is_organiser, name)
  values (v_group, p_owner, true, p_name)
  returning id into v_member;
  insert into public.group_member_secrets (member_id) values (v_member);
  return query select v_group, v_member, v_active + 1;
end;
$$;

revoke all on function public.group_create(uuid, text, text, text, date, date, uuid, timestamptz, smallint, text, int) from public, anon, authenticated;
revoke all on function public.group_active_count(uuid) from public, anon, authenticated;
revoke all on function public.group_members_cap() from public, anon, authenticated;
revoke all on function public.group_answers_bump() from public, anon, authenticated;
revoke all on function public.group_secrets_bump() from public, anon, authenticated;
grant execute on function public.group_create(uuid, text, text, text, date, date, uuid, timestamptz, smallint, text, int) to service_role;
grant execute on function public.group_active_count(uuid) to service_role;

do $$
declare
  t text;
begin
  foreach t in array array['groups', 'group_members', 'group_member_secrets', 'group_plans', 'group_plan_orders', 'group_notifications'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

comment on table public.groups is 'Group outings. Written and read only by /api/groups/* with the service role. See migration 0083.';
comment on table public.group_member_secrets is 'Private budgets and web edit-token hashes. Never returned to anyone but the member themselves.';
comment on table public.group_plan_orders is 'Each member''s own order for a group plan. Only ever read filtered by plan and member together.';
