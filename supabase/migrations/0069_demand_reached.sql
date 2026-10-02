-- A plan the chosen areas could not fill alone.
--
-- When somebody picks an area that is too thin to fill their plan, the
-- planner now reaches up to 8 km further before giving up, and the plan says
-- which neighbouring areas it used. That request was met, but not by the area
-- that was asked for, which makes it the same signal as "nothing fitted" for
-- the one question plan_demand exists to answer: where to sign venues next.
--
-- So it gets its own outcome rather than hiding among the plans that worked.
-- Until this runs, the server records those requests as 'ok'.

alter table public.plan_demand drop constraint if exists plan_demand_outcome_check;
alter table public.plan_demand
  add constraint plan_demand_outcome_check check (outcome in ('ok', 'reached', 'no_match'));
