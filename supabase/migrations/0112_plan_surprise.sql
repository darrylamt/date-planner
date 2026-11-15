-- Surprise mode (growth plan, 13 Nov 2026; Pro): the planner switches it on
-- before sharing, and the shared page (/p/<slug>) shows only the first stop.
-- Each later stop stays hidden until it is time to leave for it. The hiding is
-- done on the server, so a hidden name never reaches the guest's phone early.
--
-- Owners already update their own plans (planner_note uses the same policy);
-- the app only offers the switch to Pro. Nothing else reads the column.
alter table public.plans add column if not exists surprise boolean not null default false;
