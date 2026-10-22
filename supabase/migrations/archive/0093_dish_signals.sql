-- Dishes, as well as places (src/lib/taste.ts).
--
-- What somebody adds to a stop's order, takes off it, or swaps a dish for
-- says what they like to eat as plainly as a swapped venue says where they
-- like to go. Two new kinds on plan_signals, and the dish's name:
--   dish_added    added from the menu, or one more of it
--   dish_removed  taken off the order
--
-- The name rather than a menu item id: the planner's orders carry names, and
-- what is learned is words ("grilled", "jollof", "mojito"), so a taste for
-- tilapia at one place reaches tilapia at the next.

alter table public.plan_signals add column if not exists item text
  check (item is null or char_length(item) between 1 and 120);

alter table public.plan_signals drop constraint if exists plan_signals_kind_check;
alter table public.plan_signals add constraint plan_signals_kind_check check (kind in (
  'shown', 'swapped_away', 'swapped_in', 'saved', 'shared', 'details_opened', 'menu_opened',
  'book_tapped', 'directions_tapped', 'maps_opened', 'instagram_opened', 'venue_viewed',
  'dish_added', 'dish_removed'
));
