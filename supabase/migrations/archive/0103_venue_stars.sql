-- Starred venues (owner, 3 Nov 2026): free accounts keep up to 10, Pro any
-- number. A star is the account's own: the app reads, adds and removes its
-- own rows directly, and the limit is checked here, under a lock, so no
-- build of the app can go past it. Stars also lean the person's plans
-- towards those places (taste.ts).
--
-- RLS on (0080). Run npm run audit:smoke afterwards.

create table if not exists public.venue_stars (
  user_id uuid not null references auth.users (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

create index if not exists venue_stars_venue_idx on public.venue_stars (venue_id);

alter table public.venue_stars enable row level security;
revoke all on public.venue_stars from anon, authenticated;
grant select, insert, delete on public.venue_stars to authenticated;

drop policy if exists "venue_stars: own read" on public.venue_stars;
create policy "venue_stars: own read" on public.venue_stars for select to authenticated using (user_id = auth.uid());
drop policy if exists "venue_stars: own add" on public.venue_stars;
create policy "venue_stars: own add" on public.venue_stars for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "venue_stars: own remove" on public.venue_stars;
create policy "venue_stars: own remove" on public.venue_stars for delete to authenticated using (user_id = auth.uid());

-- Ten for a free account; any number for Pro, by the same rule as
-- entitlements.ts isPro (active or in grace, not past its expiry).
create or replace function public.venue_star_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pro boolean;
  held integer;
begin
  select e.tier = 'pro' and e.status in ('active', 'in_grace') and (e.expires_at is null or e.expires_at > now())
    into pro
    from public.entitlements e
    where e.user_id = new.user_id;
  if coalesce(pro, false) then
    return new;
  end if;
  -- One star at a time per account, so two taps at once cannot both be the tenth.
  perform pg_advisory_xact_lock(hashtext('venue_stars:' || new.user_id::text));
  select count(*) into held from public.venue_stars where user_id = new.user_id;
  if held >= 10 then
    raise exception 'star_limit' using errcode = 'P0001', hint = 'Free accounts keep 10 stars; Pro keeps any number.';
  end if;
  return new;
end;
$$;
revoke all on function public.venue_star_limit() from public;

drop trigger if exists venue_star_limit on public.venue_stars;
create trigger venue_star_limit before insert on public.venue_stars
  for each row execute function public.venue_star_limit();
