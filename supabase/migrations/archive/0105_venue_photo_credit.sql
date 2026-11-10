-- Who took a venue's cover photo, for free-licensed pictures (owner, 10 Nov
-- 2026: venue photos from the venue itself or free-licensed only).
--
-- A Wikimedia Commons photo under CC BY or CC BY-SA may be shown only with
-- its author and licence beside it. Forts, falls, parks and museums have no
-- website of their own to take a picture from, so their covers come from
-- Commons, and the app shows this line on the photo.
--
--   image_credit  "Photo: Jane Doe, CC BY-SA 4.0, Wikimedia Commons"
--   image_source  the file's page on Commons, so a picture can be traced
--
-- Null for every photo the venue gave us or we uploaded, which need no line.
-- Readable like the other public venue columns (0014 grants column by column).

alter table public.venues
  add column if not exists image_credit text check (image_credit is null or char_length(image_credit) <= 300),
  add column if not exists image_source text check (image_source is null or char_length(image_source) <= 600);

grant select (image_credit, image_source) on public.venues to anon, authenticated;
