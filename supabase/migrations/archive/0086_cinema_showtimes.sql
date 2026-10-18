-- Cinema showtimes, read from Silverbird's site (scripts/scrape-silverbird.ts).
--
-- One row per film per showing: "Street Fighter, Accra Mall, Sat 24 Oct,
-- 21:10". Kept apart from events on purpose: showings are read only when
-- someone asks for a film (src/lib/movies.ts), and then become events for
-- that one plan.
--
-- Written and read only with the service role, like every table since 0080:
-- RLS on, everything revoked from anon and authenticated, no policies.

create table if not exists public.cinema_showtimes (
  id uuid primary key default gen_random_uuid(),
  /** "silverbird:accra:street-fighter:2026-10-24:21:10", so each run updates in place. */
  external_key text not null unique check (char_length(external_key) <= 200),
  chain text not null default 'silverbird' check (chain ~ '^[a-z_]{1,32}$'),
  /** The chain's own slug for the cinema: "accra", "westhills". */
  cinema text not null check (cinema ~ '^[a-z0-9_-]{1,40}$'),
  cinema_name text not null check (char_length(cinema_name) <= 120),
  /** Our venue for the cinema, when the catalogue has it. */
  venue_id uuid references public.venues (id) on delete set null,
  film_slug text not null check (film_slug ~ '^[a-z0-9-]{1,120}$'),
  title text not null check (char_length(title) <= 200),
  runtime_mins smallint check (runtime_mins is null or runtime_mins between 1 and 600),
  /** Action, Comedy, Horror, Nollywood... The site's own "Now Showing" and "Slider" are not genres and are left out. */
  genres text[] not null default '{}',
  language text check (language is null or char_length(language) <= 60),
  rating numeric(3, 1) check (rating is null or rating between 0 and 10),
  release_date date,
  film_url text check (film_url is null or film_url ~ '^https://silverbirdcinemas\.com/'),
  /** Poster as the site serves it; not copied, not shown until we may. */
  poster_url text check (poster_url is null or poster_url ~ '^https://silverbirdcinemas\.com/'),
  show_date date not null,
  show_time time not null,
  is_active boolean not null default true,
  scraped_at timestamptz not null default now()
);

create index if not exists cinema_showtimes_upcoming
  on public.cinema_showtimes (show_date, cinema)
  where is_active;

alter table public.cinema_showtimes enable row level security;
revoke all on public.cinema_showtimes from anon, authenticated;
