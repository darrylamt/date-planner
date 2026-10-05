-- People recommending dishes, and a count the planner and adurobot can read.
--
-- One recommendation per account per item, held in its own table so it can be
-- taken back, and a running count on menu_items so every menu read already
-- carries it: the app's item rows, the planner's ordering and adurobot's
-- venue lookup all select from menu_items, and none of them has to learn a
-- join to use it.
--
-- Accounts only. An account-less session is one tap to create and costs
-- nothing to repeat, so letting it recommend would make a count anybody can
-- script. The same check 0057 uses for uploads.
--
-- The count can only be moved by the trigger. Venue portal users may update
-- their own menu rows (0038), and a column they could write is a column a
-- venue could inflate for itself; so a guard trigger puts the old value back
-- on any change that did not come from the counter.

-- ── the count ────────────────────────────────────────────────────────────

alter table public.menu_items
  add column if not exists recommend_count integer not null default 0 check (recommend_count >= 0);

create index if not exists menu_items_recommended_idx
  on public.menu_items (venue_id, recommend_count desc)
  where recommend_count > 0;

-- ── who recommended what ─────────────────────────────────────────────────

create table if not exists public.menu_item_recommendations (
  user_id uuid not null references auth.users (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, menu_item_id)
);

create index if not exists menu_item_recommendations_item_idx
  on public.menu_item_recommendations (menu_item_id);

alter table public.menu_item_recommendations enable row level security;

drop policy if exists "recommendations: own read" on public.menu_item_recommendations;
create policy "recommendations: own read" on public.menu_item_recommendations
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "recommendations: own insert" on public.menu_item_recommendations;
create policy "recommendations: own insert" on public.menu_item_recommendations
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

drop policy if exists "recommendations: own delete" on public.menu_item_recommendations;
create policy "recommendations: own delete" on public.menu_item_recommendations
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.menu_item_recommendations to authenticated;

-- ── keeping the count ────────────────────────────────────────────────────

create or replace function public.count_menu_recommendation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('aduro.counting_recommendations', 'on', true);
  if tg_op = 'INSERT' then
    update public.menu_items set recommend_count = recommend_count + 1 where id = new.menu_item_id;
  elsif tg_op = 'DELETE' then
    update public.menu_items set recommend_count = greatest(0, recommend_count - 1) where id = old.menu_item_id;
  end if;
  perform set_config('aduro.counting_recommendations', 'off', true);
  return null;
end;
$$;

drop trigger if exists menu_item_recommendations_count on public.menu_item_recommendations;
create trigger menu_item_recommendations_count
  after insert or delete on public.menu_item_recommendations
  for each row execute function public.count_menu_recommendation();

-- The count is the trigger's alone: any other write keeps the value it had.
create or replace function public.guard_recommend_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('aduro.counting_recommendations', true), 'off') <> 'on' then
    if tg_op = 'INSERT' then
      new.recommend_count := 0;
    else
      new.recommend_count := old.recommend_count;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists menu_items_guard_recommend_count on public.menu_items;
create trigger menu_items_guard_recommend_count
  before insert or update on public.menu_items
  for each row execute function public.guard_recommend_count();

revoke execute on function public.count_menu_recommendation() from public, anon, authenticated;
