-- When a venue is actually open.
--
-- The planner could pick a good venue, in the right area, at the right price,
-- and still send someone to a locked door. Checked against the live Places
-- API while writing this: Bliss Family Entertainment is closed every Monday,
-- and Game It Up shuts at 21:00 seven days a week. Nothing in the catalogue
-- knew either, so a Monday plan would have named Bliss, priced it, routed a
-- taxi to it and said nothing.
--
-- Stored in Google's own shape rather than a tidier one of our own. Their
-- periods already handle the two things that make opening hours awkward,
-- closing after midnight and being shut on a given day entirely, and every
-- reshaping on the way in is a chance to lose one of them. A Saturday that
-- runs to midnight arrives as open day 6 / close day 0, and that join is the
-- part a simpler "open_time, close_time per day" table would break.

alter table venues
  add column if not exists opening_periods jsonb,
  add column if not exists opening_hours_text text[],
  add column if not exists hours_synced_at timestamptz;

comment on column venues.opening_periods is
  'Google Places regularOpeningHours.periods, verbatim: [{open:{day,hour,minute}, close:{day,hour,minute}}]. day 0 is Sunday. A missing close means open around the clock. Null means the hours are not known, which is NOT the same as closed and must never be read as either.';
comment on column venues.opening_hours_text is
  'Google weekdayDescriptions, for showing a human rather than for deciding anything.';
comment on column venues.hours_synced_at is
  'When the hours were last pulled. Hours drift, so an old sync is a reason to re-check rather than a reason to trust.';

-- Reading hours is exactly as public as reading a venue name: a signed-out
-- person building a plan has to know the place will be open. Added to both
-- roles explicitly because migration 0013 replaced the blanket table grant
-- with a column list, so a new column reaches nobody until it is named here.
grant select (opening_periods, opening_hours_text, hours_synced_at) on venues to anon;
grant select (opening_periods, opening_hours_text, hours_synced_at) on venues to authenticated;
