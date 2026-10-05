-- 0074: a Gaderin activity Duro will not use.
--
-- Paragliding in Nkawkaw, a hike at Shai Hills: real, on sale, and nowhere a
-- plan in Accra or Kumasi can go. Marked here from the admin page so the
-- "needs a venue" queue holds only what is worth linking. The daily scraper
-- never writes this column, so a choice made once stays made.
alter table public.gaderin_activities
  add column if not exists dismissed boolean not null default false;
