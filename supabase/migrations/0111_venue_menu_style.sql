-- 0111: how a venue's public menu page looks (14 Nov 2026).
--
-- A venue chooses its logo, a cover photo, a light or dark page, an accent
-- colour, and a font for headings and one for the rest. The page is
-- duroplans.com/menu/<id>/<name>; dishes show their own photos (menu_items.
-- image_url, already there) or a drawn silhouette when they have none.
--
-- Its own table rather than columns on venues: venue owners' edits to venues
-- pass through venues_enforce_portal_columns (0047, 0048, 0095), and this
-- keeps that list as it is. Anyone may read a style (the page is public);
-- only a login that runs the venue, or an admin, may write one.

create table if not exists public.venue_menu_style (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  logo_url text check (logo_url is null or (char_length(logo_url) <= 600 and logo_url like 'https://%')),
  cover_url text check (cover_url is null or (char_length(cover_url) <= 600 and cover_url like 'https://%')),
  theme text not null default 'light' check (theme in ('light', 'dark')),
  accent text not null default '#C2410C' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  heading_font text not null default 'Fraunces' check (char_length(heading_font) <= 40),
  body_font text not null default 'DM Sans' check (char_length(body_font) <= 40),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.venue_menu_style enable row level security;

drop policy if exists "venue_menu_style: read" on public.venue_menu_style;
create policy "venue_menu_style: read" on public.venue_menu_style
  for select using (true);

drop policy if exists "venue_menu_style: own venue writes" on public.venue_menu_style;
create policy "venue_menu_style: own venue writes" on public.venue_menu_style
  for all to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.venue_users vu where vu.venue_id = venue_menu_style.venue_id and vu.user_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.venue_users vu where vu.venue_id = venue_menu_style.venue_id and vu.user_id = auth.uid())
  );

grant select on public.venue_menu_style to anon, authenticated;
grant insert, update on public.venue_menu_style to authenticated;
