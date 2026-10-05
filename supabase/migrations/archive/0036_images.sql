-- Pictures: more than one per stop, and a place to put files.
--
-- ── 1. Events had no picture at all ─────────────────────────────────────
-- A dated one-off is the thing a poster exists for. The catalogue could name
-- a block party, price it and place it in an evening, and then show the
-- burger shop's usual photograph beside it, which is a picture of the wrong
-- thing on the one stop where the picture matters most.
--
-- ── 2. Venues had exactly one ───────────────────────────────────────────
-- image_url stays the hero and keeps every caller working. gallery_urls is
-- what comes after it, so a stop can be swiped through rather than glanced at:
-- the room, the food, the terrace. Empty means nobody has added any, which is
-- the same thing it has always meant for image_url being null.
--
-- An array rather than a table, deliberately. A venue_images table buys
-- captions, ordering and per-image metadata that nothing in the app asks for,
-- at the cost of a join on the hottest read path in the product. The order in
-- the array is the order on screen, which is the only ordering anybody needs.
--
-- ── 3. Somewhere for uploaded files to live ─────────────────────────────
-- Every image in this catalogue has been a URL typed into a box, which works
-- exactly as long as somebody else keeps hosting the file. A venue that
-- redesigns its site takes its photograph out of every plan that used it, and
-- nothing here would know.
--
-- The bucket is public-read because these are pictures of restaurants shown on
-- shared plan links opened by people who are not signed in; a signed URL there
-- would expire in somebody's WhatsApp thread. Writes do not go through storage
-- RLS at all: uploads are made by /api/admin/upload with the service role,
-- after requireAdmin has checked the caller, which is the same gate every
-- other admin write already passes through.

alter table public.events
  add column if not exists image_url text;

comment on column public.events.image_url is
  'The event''s own picture, usually a poster. Null means nobody has added one, and the stop falls back to the venue''s.';

alter table public.venues
  add column if not exists gallery_urls text[] not null default '{}';

comment on column public.venues.gallery_urls is
  'Further pictures, in the order they should be shown. image_url stays the hero and is not repeated here. Empty means nobody has added any.';

-- Both halves of adding a venue column. 0015 added price_source without the
-- grant and took plan generation down until 0017 put it back.
grant select (gallery_urls) on public.venues to anon;
grant select (gallery_urls) on public.venues to authenticated;

-- ── The bucket ──────────────────────────────────────────────────────────
-- Five megabytes and image types only. The upload route checks the same two
-- things, because a limit enforced in one place is a limit until somebody
-- writes a second caller.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'images',
  'images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Reading is open, which is what "public" on the bucket already means; saying
-- it as a policy too keeps the two from disagreeing if the flag is ever
-- flipped by hand in the dashboard.
drop policy if exists "images are publicly readable" on storage.objects;
create policy "images are publicly readable" on storage.objects
  for select using (bucket_id = 'images');

-- No insert, update or delete policy on purpose. Nothing but the service role
-- writes here, and a policy granting authenticated users write access to a
-- public bucket is a file host for anybody with an account.
