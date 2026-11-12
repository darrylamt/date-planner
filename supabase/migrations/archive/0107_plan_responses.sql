-- "I'm in" on a shared plan (owner, 12 Nov 2026). In thirty days shared plans
-- were opened 31 times and led nowhere: the page gave the person it was sent
-- to nothing to do. Now they can answer, the planner is told, and the answer
-- shows on the plan.
--
-- One row per person per plan. `visitor` is a keyed hash of a random id their
-- browser keeps (rateKey in rateLimit.ts), so answering again changes their
-- answer instead of adding one, and there is no way back from it to a person.
-- `name` and `note` are what they chose to type, shown to the planner only.
--
-- Follows 0080: RLS on, nothing for anon. The server writes (the page has no
-- account to write as); the plan's owner reads the answers to their own plans.
-- Run npm run audit:smoke afterwards.

create table if not exists public.plan_responses (
  id bigint generated always as identity primary key,
  plan_id uuid not null references public.plans (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  answer text not null check (answer in ('in', 'cant')),
  name text check (name is null or char_length(name) between 1 and 40),
  note text check (note is null or char_length(note) <= 200),
  visitor text not null check (char_length(visitor) <= 80),
  unique (plan_id, visitor)
);

create index if not exists plan_responses_plan_idx on public.plan_responses (plan_id, updated_at desc);

alter table public.plan_responses enable row level security;
revoke all on public.plan_responses from anon, authenticated;
grant select on public.plan_responses to authenticated;

drop policy if exists "plan_responses: the planner reads" on public.plan_responses;
create policy "plan_responses: the planner reads" on public.plan_responses
  for select to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_responses.plan_id and p.user_id = auth.uid()));
