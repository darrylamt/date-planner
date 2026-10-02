-- Whether a shared plan brings anybody in.
--
-- Every plan somebody shares is an advert for the app, and the only one that
-- arrives from a friend. This counts, anonymously, what happens on the way:
-- the shared page opened, "Plan your own" tapped, the App Store badge tapped.
-- Downloads themselves are Apple's to count, through the campaign tag on those
-- App Store links (App Store Connect, App Analytics, Campaigns).
--
-- No account, no IP address, no device or browser identifier, nothing stored
-- on the visitor's side. The plan's share slug is kept so opens can be counted
-- per plan rather than per tap, and the occasion so a birthday's share can be
-- compared with a date's.
--
-- Written only by the server (service role) from /api/share-event; read only
-- by admins through the service role.

create table if not exists public.share_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('view', 'plan_your_own', 'app_store')),
  page text not null check (page in ('shared_plan', 'get', 'home', 'name_poll')),
  plan_slug text,
  occasion text
);

create index if not exists share_events_created_idx on public.share_events (created_at desc);

alter table public.share_events enable row level security;
-- No policies: nothing but the service role reads or writes it.
revoke all on public.share_events from anon, authenticated;
