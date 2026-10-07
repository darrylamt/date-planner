-- Shared bills, counted like shared plans.
--
-- The app's "Send everyone their share" now carries a link to a page on the
-- site (/b/<code>) with the breakdown and a way to get the app. Its opens and
-- its App Store taps go in share_events like a shared plan's, under a page of
-- their own, so the admin's Sharing page can say what a split leads to.

alter table public.share_events drop constraint if exists share_events_page_check;
alter table public.share_events
  add constraint share_events_page_check
  check (page in ('shared_plan', 'get', 'home', 'name_poll', 'split'));
