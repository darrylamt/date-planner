-- aduro, user reports on venues
--
-- The catalog goes stale in ways nothing automated catches. Google knows when
-- a place shuts, but not that its prices went up in June, that the padel court
-- is now GHS 300 an hour, or that the number on the door is not the number we
-- hold. The people who find that out are the ones standing there.
--
-- So: let them say so, the way a driver flags a closed road. One tap, no
-- account required, plans can be built signed-out, and a reporting flow that
-- demands a login would lose exactly the person with the fresh information.
--
-- Nothing here changes the catalog on its own. A report is a flag for a human,
-- not an edit: the same rule the phone gate already works by, for the same
-- reason, a venue anyone could silently repoint is a venue anyone could
-- silently repoint at themselves.

create table if not exists public.venue_reports (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,

  report_type text not null
    check (report_type in ('price', 'closed', 'phone', 'wrong_info', 'other')),

  /** What they say it should be. Only meaningful for a price report. */
  suggested_price_ghs numeric(10,2),
  note text,

  /** Set when the reporter happened to be signed in. Most will not be. */
  reporter_id uuid references auth.users (id) on delete set null,
  /**
   * A per-install identifier, not an identity. It exists so one person
   * tapping twice does not read as two people agreeing, which is the number
   * an admin uses to decide what to believe.
   */
  reporter_device text,

  status text not null default 'open'
    check (status in ('open', 'actioned', 'dismissed')),

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create index if not exists venue_reports_venue_idx
  on public.venue_reports (venue_id, created_at desc);

create index if not exists venue_reports_open_idx
  on public.venue_reports (created_at desc)
  where status = 'open';

/*
 * One open report per device per venue per kind.
 *
 * Enforced here rather than in the route because a check-then-insert races
 * against a double tap, and the count is the whole signal: five reports has to
 * mean five people, or an admin cannot tell a real closure from one person
 * with a stuck button. Partial on status so the same venue can be reported
 * again later, once the last report has been dealt with.
 */
create unique index if not exists venue_reports_one_open_per_device_idx
  on public.venue_reports (venue_id, report_type, reporter_device)
  where status = 'open' and reporter_device is not null;

alter table public.venue_reports enable row level security;

-- Anyone can report; plans are built signed-out and the reporter is usually
-- standing outside the venue, not logged into anything.
create policy "venue reports: public insert" on public.venue_reports
  for insert with check (true);

-- Reporters can see what they filed; admins see and manage everything.
create policy "venue reports: own read" on public.venue_reports
  for select using (auth.uid() = reporter_id or public.is_admin());
create policy "venue reports: admin update" on public.venue_reports
  for update using (public.is_admin());
create policy "venue reports: admin delete" on public.venue_reports
  for delete using (public.is_admin());

/*
 * A phone report also bumps the counters the phone review screen already
 * reads, so that page keeps working untouched rather than growing a second
 * source of truth it would have to reconcile.
 */
create or replace function public.bump_phone_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.report_type = 'phone' then
    update public.venues
       set phone_report_count = coalesce(phone_report_count, 0) + 1,
           phone_reported_at = now()
     where id = new.venue_id;
  end if;
  return new;
end;
$$;

drop trigger if exists venue_reports_bump_phone on public.venue_reports;

create trigger venue_reports_bump_phone
  after insert on public.venue_reports
  for each row execute function public.bump_phone_report();
