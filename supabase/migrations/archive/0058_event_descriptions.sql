-- What an event is, in a sentence or two.
--
-- An event had a title and nothing else to say about itself. "Jazz Night" on
-- a plan does not tell anybody who is playing, whether it is dinner with a
-- band or a band with a bar, or what to wear, which is most of what somebody
-- wants to know before building an evening round it.
--
-- Nullable, and null means nobody wrote one: the stop shows the title alone,
-- as it always has. Capped at 400 characters because it is shown on a card,
-- not a page.
--
-- No new grant or policy. The events policies are table-wide, so the admin
-- and the venue's own portal can write this column the same way they write
-- the title.

alter table public.events
  add column if not exists description text
  check (description is null or char_length(description) <= 400);
