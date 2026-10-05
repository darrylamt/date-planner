-- A picture for a menu item.
--
-- The item sheet in the app shows one when there is one: the dish, the
-- cocktail, the padel court. Nullable, and null is the normal case for a long
-- while; the sheet is laid out to look complete without it.
--
-- Written by admins and by a venue's own portal users through the existing
-- menu_items policies (0038), which are table-wide, so no new grant or policy.

alter table public.menu_items
  add column if not exists image_url text
  check (image_url is null or char_length(image_url) <= 1000);
