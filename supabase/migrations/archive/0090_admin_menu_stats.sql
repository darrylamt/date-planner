-- Menu totals per venue, for the admin (src/lib/menuStats.ts).
--
-- The sidebar badges, the venues table and the thin-menus queue all need the
-- same four things per venue: how many dishes, how many in each category, and
-- when the menu was last touched. They were reading every menu item to work
-- that out -- 19,783 rows, twenty pages of a thousand, one after another --
-- which was about 4.7 seconds of every admin page, and twice that on Venues.
-- Grouped here, it is one row per venue.
--
-- The app falls back to the paged read when this has not been run, so the
-- admin works either way; it is only slower without it.
--
-- Executed only by the service role, like every table since 0080.

create or replace function public.admin_menu_stats()
returns table (venue_id uuid, items integer, latest timestamptz, by_category jsonb)
language sql
stable
set search_path = public
as $$
  with c as (
    select m.venue_id, m.category::text as category, count(*)::integer as n, max(m.updated_at) as latest
    from public.menu_items m
    group by m.venue_id, m.category
  )
  select c.venue_id, sum(c.n)::integer, max(c.latest), jsonb_object_agg(c.category, c.n)
  from c
  group by c.venue_id
$$;

revoke all on function public.admin_menu_stats() from public, anon, authenticated;
grant execute on function public.admin_menu_stats() to service_role;
