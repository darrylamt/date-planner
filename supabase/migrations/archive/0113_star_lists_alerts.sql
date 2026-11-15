-- Star lists and alerts (Pro; agreed 3 Nov 2026, built 15 Nov 2026).
--
-- Lists: a Pro account names lists ("Date spots", "Birthday ideas") and puts
-- its starred places in them. The account's own rows, read and written by
-- the app under RLS; making a list or adding to one is Pro, checked here.
-- When Pro ends, the lists stay readable and can be emptied, not added to.
--
-- Alerts: a Pro account can turn on notification_prefs.star_alerts, and once
-- a day (the 17:00 cron, src/lib/starAlerts.ts) it is told when a starred
-- place adds an event or new dishes, or changes a price. Off until turned on.
-- star_watch_seen is what each watched place had when last looked at, so
-- the job can tell what is new; star_alert_sends claims each push before it
-- goes. Both are service role only.
--
-- RLS on (0080). Run npm run audit:smoke afterwards.

-- ── Pro, by the same rule as entitlements.ts isPro and 0103 ──
create or replace function public.is_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select e.tier = 'pro' and e.status in ('active', 'in_grace') and (e.expires_at is null or e.expires_at > now())
       from public.entitlements e where e.user_id = uid),
    false);
$$;
revoke all on function public.is_pro(uuid) from public;

-- ── Lists ──
create table if not exists public.star_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists star_lists_user_idx on public.star_lists (user_id, created_at);

create table if not exists public.star_list_venues (
  list_id uuid not null references public.star_lists (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, venue_id)
);
create index if not exists star_list_venues_user_idx on public.star_list_venues (user_id);

alter table public.star_lists enable row level security;
alter table public.star_list_venues enable row level security;
revoke all on public.star_lists from anon, authenticated;
revoke all on public.star_list_venues from anon, authenticated;
grant select, insert, update (name), delete on public.star_lists to authenticated;
grant select, insert, delete on public.star_list_venues to authenticated;

drop policy if exists "star_lists: own read" on public.star_lists;
create policy "star_lists: own read" on public.star_lists for select to authenticated using (user_id = auth.uid());
drop policy if exists "star_lists: own add" on public.star_lists;
create policy "star_lists: own add" on public.star_lists for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "star_lists: own rename" on public.star_lists;
create policy "star_lists: own rename" on public.star_lists for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "star_lists: own remove" on public.star_lists;
create policy "star_lists: own remove" on public.star_lists for delete to authenticated using (user_id = auth.uid());

drop policy if exists "star_list_venues: own read" on public.star_list_venues;
create policy "star_list_venues: own read" on public.star_list_venues for select to authenticated using (user_id = auth.uid());
-- Into one's own list only.
drop policy if exists "star_list_venues: own add" on public.star_list_venues;
create policy "star_list_venues: own add" on public.star_list_venues for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.star_lists l where l.id = list_id and l.user_id = auth.uid()));
drop policy if exists "star_list_venues: own remove" on public.star_list_venues;
create policy "star_list_venues: own remove" on public.star_list_venues for delete to authenticated using (user_id = auth.uid());

-- Pro to make a list or add to one; at most 50 lists, as a guard.
create or replace function public.star_list_pro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_pro(new.user_id) then
    raise exception 'star_lists_pro' using errcode = 'P0001', hint = 'Lists are part of Pro.';
  end if;
  if tg_table_name = 'star_lists' and (select count(*) from public.star_lists where user_id = new.user_id) >= 50 then
    raise exception 'star_lists_many' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.star_list_pro() from public;

drop trigger if exists star_lists_pro on public.star_lists;
create trigger star_lists_pro before insert on public.star_lists for each row execute function public.star_list_pro();
drop trigger if exists star_list_venues_pro on public.star_list_venues;
create trigger star_list_venues_pro before insert on public.star_list_venues for each row execute function public.star_list_pro();

-- ── Alerts ──
alter table public.notification_prefs add column if not exists star_alerts boolean not null default false;
comment on column public.notification_prefs.star_alerts is
  'Pro: told once a day when a starred place adds an event or dishes, or changes a price (src/lib/starAlerts.ts). Off until turned on.';

create table if not exists public.star_watch_seen (
  venue_id uuid not null references public.venues (id) on delete cascade,
  -- 'watch' (the place was looked at once: later finds are news), 'event' or 'dish'.
  kind text not null check (kind in ('watch', 'event', 'dish')),
  -- The event's title and date, or the dish's name, folded.
  key text not null,
  -- The dish's price, so a change can be told.
  value text,
  first_seen timestamptz not null default now(),
  primary key (venue_id, kind, key)
);
alter table public.star_watch_seen enable row level security;

create table if not exists public.star_alert_sends (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The day it belongs to: one alert a day at most.
  period text not null,
  title text not null,
  body text not null,
  url text,
  delivered int not null default 0,
  sent_at timestamptz not null default now(),
  primary key (user_id, period)
);
alter table public.star_alert_sends enable row level security;
-- No policies on either: only the service role reads or writes them.
