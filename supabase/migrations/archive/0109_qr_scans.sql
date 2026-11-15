-- 0109: count table-sticker scans (13 Nov 2026).
--
-- A venue's QR sticker opens /q/<code>, which records one share_events row
-- (kind 'qr', page 'menu', plan_slug holding the venue id) before sending
-- the phone to the venue's public menu page. 0070 fixed the kinds and 0077
-- the pages; this adds one of each and keeps the rest.

alter table public.share_events drop constraint if exists share_events_kind_check;
alter table public.share_events
  add constraint share_events_kind_check check (kind in ('view', 'plan_your_own', 'app_store', 'qr'));

alter table public.share_events drop constraint if exists share_events_page_check;
alter table public.share_events
  add constraint share_events_page_check check (page in ('shared_plan', 'get', 'home', 'name_poll', 'split', 'menu'));
