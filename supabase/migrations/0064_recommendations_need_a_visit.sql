-- A recommendation counts only when there is a visit behind it.
--
-- 0063 let any account recommend any dish and counted every one. Nothing
-- stopped somebody tapping Recommend down a menu they had never eaten from,
-- or a venue recommending itself from staff accounts. Attendance cannot be
-- proved, and trying (GPS check-ins) is spoofable and puts people off, so the
-- test is whether there is a trail: this person planned a visit here, for
-- today or a day already gone, or asked for a table here that has come round.
--
-- Everybody can still tap Recommend. One without a trail is kept, privately,
-- as that person's favourite, and simply does not add to the public count.
-- Nobody is refused and nothing is thrown away: the count is honest about
-- what it measures, "people who planned a visit", and the app says so.
--
-- Two guard rails on top: an account under a day old does not count, and an
-- account counts at most 20 recommendations in any 24 hours.
--
-- A recommendation is judged when it is made. Recommending before the date
-- does not start counting when the date passes, which is right: a
-- recommendation made before going is a guess, not a report.

alter table public.menu_item_recommendations
  add column if not exists counted boolean not null default false;

create or replace function public.recommendation_has_a_visit(p_user uuid, p_venue uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with branch as (
    -- The venue and every branch sharing its menu, in either direction: a
    -- plan at the Labone Honeysuckle is a visit to the Osu menu.
    select id from public.venues
    where id = p_venue
       or menu_shared_from = p_venue
       or id = (select menu_shared_from from public.venues where id = p_venue)
       or (menu_shared_from is not null
           and menu_shared_from = (select menu_shared_from from public.venues where id = p_venue))
  ),
  today as (
    select to_char(now() at time zone 'Africa/Accra', 'YYYY-MM-DD') as d
  )
  select
    (select created_at from auth.users where id = p_user) <= now() - interval '1 day'
    and (
      select count(*) from public.menu_item_recommendations
      where user_id = p_user and counted and created_at > now() - interval '1 day'
    ) < 20
    and (
      exists (
        select 1
        from public.plans p, jsonb_array_elements(coalesce(p.itinerary -> 'stops', '[]'::jsonb)) s
        where p.user_id = p_user
          and p.plan_date <= (select d from today)
          and (s ->> 'venue_id') in (select id::text from branch)
      )
      or exists (
        select 1 from public.reservation_requests r
        where r.user_id = p_user
          and r.venue_id in (select id from branch)
          and r.reservation_date <= (now() at time zone 'Africa/Accra')::date
      )
    );
$$;

revoke execute on function public.recommendation_has_a_visit(uuid, uuid) from public, anon, authenticated;

-- Judged on the way in; the client cannot set it.
create or replace function public.judge_recommendation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.counted := public.recommendation_has_a_visit(new.user_id, new.venue_id);
  return new;
end;
$$;

drop trigger if exists menu_item_recommendations_judge on public.menu_item_recommendations;
create trigger menu_item_recommendations_judge
  before insert on public.menu_item_recommendations
  for each row execute function public.judge_recommendation();

-- A recommendation cannot be edited into counting: only inserted and deleted.
revoke update on public.menu_item_recommendations from authenticated;

-- The counter moves only for counted rows.
create or replace function public.count_menu_recommendation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('aduro.counting_recommendations', 'on', true);
  if tg_op = 'INSERT' and new.counted then
    update public.menu_items set recommend_count = recommend_count + 1 where id = new.menu_item_id;
  elsif tg_op = 'DELETE' and old.counted then
    update public.menu_items set recommend_count = greatest(0, recommend_count - 1) where id = old.menu_item_id;
  end if;
  perform set_config('aduro.counting_recommendations', 'off', true);
  return null;
end;
$$;

-- Everything recommended so far, judged by the same rule, and the counts rebuilt from it.
update public.menu_item_recommendations
set counted = public.recommendation_has_a_visit(user_id, venue_id);

do $$
begin
  perform set_config('aduro.counting_recommendations', 'on', true);
  update public.menu_items m
  set recommend_count = coalesce(
    (select count(*) from public.menu_item_recommendations r where r.menu_item_id = m.id and r.counted), 0)
  where m.recommend_count > 0
     or exists (select 1 from public.menu_item_recommendations r where r.menu_item_id = m.id);
  perform set_config('aduro.counting_recommendations', 'off', true);
end;
$$;
