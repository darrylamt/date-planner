-- The blog and venue outreach (owner, 16 Nov 2026).
--
-- blog_posts: one a day, written by src/lib/blog.ts from catalogue facts.
-- Gemini writes only the words around them; every name, price and link is
-- put in by our code, and a draft that mentions a number or a place it was
-- not given is thrown away. Read by anyone when published; written by the
-- server only. The social team can hide one.
--
-- venue_outreach: the social team's list of venues asked to share Duro!
-- (put their menu link in their bio, repost a flyer each month, in return
-- for three months of Portal Pro, which the owner turns on by hand). One row
-- per venue: where the conversation is. Written by the server only.
--
-- RLS on (0080). Run npm run audit:smoke afterwards.

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null,
  title text not null,
  description text not null,
  -- { intro, items: [{ venue_id?, event_id?, heading, facts, text, link }], outro }
  body jsonb not null,
  -- The places and events in it, for the topic rotation and the sitemap.
  venue_ids uuid[] not null default '{}',
  hero_image text,
  status text not null default 'published' check (status in ('published', 'hidden')),
  model text,
  published_at timestamptz not null default now()
);
create index if not exists blog_posts_published_idx on public.blog_posts (published_at desc);

alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
drop policy if exists "blog_posts: read published" on public.blog_posts;
create policy "blog_posts: read published" on public.blog_posts for select using (status = 'published');

create table if not exists public.venue_outreach (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  status text not null default 'todo' check (status in ('todo', 'messaged', 'agreed', 'posting', 'declined')),
  notes text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.venue_outreach enable row level security;
revoke all on public.venue_outreach from anon, authenticated;
-- No policies: only the server (service role) reads or writes it.
