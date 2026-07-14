-- aduro — reservation requests
-- System of record for reservations made on a user's behalf. Delivery today
-- is a WhatsApp handoff to the venue's phone; this table is the spine of a
-- future venue-facing portal (venues confirm/decline from their own view).

create table public.reservation_requests (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues (id) on delete set null,
  venue_name text not null,
  user_id uuid references auth.users (id) on delete set null,
  plan_slug text,
  party_size int not null default 2 check (party_size between 1 and 20),
  reservation_date date not null,
  arrival_time text not null,
  guest_name text,
  status text not null default 'requested'
    check (status in ('requested', 'sent', 'confirmed', 'declined', 'cancelled')),
  channel text not null default 'whatsapp',
  created_at timestamptz not null default now()
);

create index reservation_requests_venue_idx
  on public.reservation_requests (venue_id, created_at desc);
create index reservation_requests_status_idx
  on public.reservation_requests (status, created_at desc);

alter table public.reservation_requests enable row level security;

-- Anyone planning a date can lodge a request (plans can be built signed-out).
create policy "reservations: public insert" on public.reservation_requests
  for insert with check (true);

-- Owners see their own requests; admins see and manage everything.
create policy "reservations: own read" on public.reservation_requests
  for select using (auth.uid() = user_id or public.is_admin());
create policy "reservations: admin update" on public.reservation_requests
  for update using (public.is_admin());
create policy "reservations: admin delete" on public.reservation_requests
  for delete using (public.is_admin());
