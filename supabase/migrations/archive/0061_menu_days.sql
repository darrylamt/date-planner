-- Prices that depend on the day.
--
-- 0021 let a price depend on the hour: Aura's padel court is GHS 300 before
-- 16:00 and GHS 600 after. Some prices depend on the day instead. Mövenpick's
-- pool is GHS 85 on a weekday and GHS 130 at the weekend, The C Resort's
-- 150 and 200, and some kitchens run a different menu on a Friday. Without
-- this the planner would take the cheaper line and quote a Saturday at the
-- weekday price.
--
-- The days a line is on sale, 0 = Sunday to 6 = Saturday, the convention the
-- opening hours already use. Null means every day, which is every row today,
-- so nothing existing changes. The same dish can be listed twice, once per
-- set of days, each at its own price.

alter table public.menu_items
  add column if not exists available_days smallint[]
  check (available_days is null or (available_days <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(available_days) between 1 and 7));
