-- Where each plan was started from.
--
-- The app is being rearranged so a new user knows what to do (Home's occasion
-- row, a Durobot tab, onboarding that ends in the planner), and nothing
-- recorded which door anybody came in by. plan_demand already logs every
-- generate request; entry adds the door: home_row, home_all, tab_plus,
-- onboarding, quick_action, widget, push_birthday, plans_empty, repeat,
-- chat, deeplink. Null for anything from before this, or an older app.
--
-- A loose text with a shape check rather than an enum, so a newer app's new
-- entry point is recorded rather than refused.

alter table public.plan_demand
  add column if not exists entry text
  check (entry is null or entry ~ '^[a-z_]{1,32}$');

create index if not exists plan_demand_entry_idx on public.plan_demand (entry, created_at desc);

comment on column public.plan_demand.entry is
  'Which entry point started the plan (home_row, tab_plus, onboarding, ...). Null before 0085 or from an older app.';
