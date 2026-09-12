-- Branches that share a menu, and venues with more than one phone number.
--
-- ── the menu ────────────────────────────────────────────────────────────
--
-- The Honeysuckle has five branches in Accra and one menu across all of them.
-- The Osu row already holds 182 items. Without this, the other four need those
-- 182 rows each, 728 duplicates that then have to be kept in step by hand
-- forever: change a price at head office and you have five places to change it
-- and four chances to forget. Vida e Caffe is already three rows and Pinocchio
-- two, so this is not one restaurant's problem.
--
-- A pointer rather than a brands table. Every branch is still a venue in its
-- own right, which is what it has to be: it has its own address, its own area,
-- its own opening hours, its own phone number, and the planner routes taxis to
-- one branch and not another. The only thing shared is the price list, so the
-- only thing shared is the price list.
--
-- One level deep, enforced. A chain of pointers is a loop waiting to happen
-- and nothing that follows it would terminate.

alter table venues
  add column if not exists menu_shared_from uuid references venues (id) on delete set null;

comment on column venues.menu_shared_from is
  'This branch is priced from another venue''s menu. Null means it has its own. Set it on the branch, not the original: Osu holds The Honeysuckle menu and the other four point at Osu.';

alter table venues drop constraint if exists venues_menu_shared_not_self;
alter table venues
  add constraint venues_menu_shared_not_self check (menu_shared_from is null or menu_shared_from <> id);

create index if not exists venues_menu_shared_idx on venues (menu_shared_from)
  where menu_shared_from is not null;

-- Every migration that adds a venues column has to grant it, because 0013 and
-- 0014 turned the venue grant into an explicit list. 0015 forgot and took plan
-- generation down until 0017 put it back.
grant select (menu_shared_from) on public.venues to anon;
grant select (menu_shared_from) on public.venues to authenticated;

-- A CHECK cannot see another row, so the no-chains rule needs a trigger.
create or replace function public.venues_menu_share_one_level()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.menu_shared_from is not null then
    if exists (
      select 1 from venues
      where id = new.menu_shared_from and menu_shared_from is not null
    ) then
      raise exception
        'menu_shared_from must point at a venue that owns its own menu, not at another branch';
    end if;

    -- And nobody may point at this venue if it is about to borrow a menu.
    if exists (select 1 from venues where menu_shared_from = new.id) then
      raise exception
        'other branches are priced from this venue, so it cannot borrow a menu itself';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.venues_menu_share_one_level() from public, anon, authenticated;

drop trigger if exists venues_menu_share_one_level on venues;
create trigger venues_menu_share_one_level
  before insert or update of menu_shared_from, id on venues
  for each row execute function public.venues_menu_share_one_level();

-- ── the phone numbers ───────────────────────────────────────────────────
--
-- venues.phone is one number and stays one number: it is the number the
-- reservation flow dials, and "which of these five do we call" is not a
-- question the booking code should have to answer at the moment of booking.
-- This table holds the others, each approved on its own, because the whole
-- point of the gate in 0004 is that an unreviewed number never reaches anyone.
--
-- Worth noting the difference from 0013. There the column was the secret, so
-- column privileges were the tool and RLS was useless. Here the row is the
-- secret: an approved number is public and a pending one is not, and that is
-- precisely what row-level security is for.

create table if not exists public.venue_phones (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  number text not null,
  /** What it is for, when a venue splits them: "Reservations", "WhatsApp". */
  label text,
  status text not null default 'pending',
  /** Where it came from, so an unreviewed number is never mistaken for a checked one. */
  source text,
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  report_count integer not null default 0,
  reported_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (venue_id, number)
);

alter table public.venue_phones
  drop constraint if exists venue_phones_status_known;
alter table public.venue_phones
  add constraint venue_phones_status_known check (status in ('pending', 'approved', 'rejected'));

create index if not exists venue_phones_venue_idx on public.venue_phones (venue_id, sort_order);

alter table public.venue_phones enable row level security;

-- Approved numbers are as public as a venue's name. Pending ones reach nobody.
drop policy if exists "venue phones: approved are public" on public.venue_phones;
create policy "venue phones: approved are public" on public.venue_phones
  for select using (status = 'approved');

-- Admin reads and writes run through the service role, which bypasses RLS, so
-- there is deliberately no admin policy here to widen.
grant select on public.venue_phones to anon, authenticated;

comment on table public.venue_phones is
  'Additional numbers for a venue. venues.phone remains the one the reservation flow dials; these are alternates, each approved separately. Only approved rows are readable by anyone but the service role.';

-- ── carry over what is already approved ─────────────────────────────────
-- So the table is the complete picture from the start rather than a partial
-- one that has to be reconciled later.
insert into public.venue_phones (venue_id, number, label, status, source, approved_at, sort_order)
select id, phone, 'Main', 'approved', coalesce(phone_source, 'carried over from venues.phone'),
       coalesce(phone_approved_at, now()), 0
from venues
where phone is not null and phone <> ''
on conflict (venue_id, number) do nothing;
