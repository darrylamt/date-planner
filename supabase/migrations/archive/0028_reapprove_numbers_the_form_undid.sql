-- Put back the twenty approvals the venue form quietly undid.
--
-- VenueForm sent `phone` through its payload spread and rewrote the pending
-- trio on every single save:
--
--     phone_pending: v.phone || null,
--     phone_status:  v.phone ? "pending" : "none",
--     phone_source:  "admin edit, unreviewed",
--
-- and `v.phone` was seeded from venues.phone, the approved column. So editing
-- a venue for any unrelated reason, a price, a dish, an image, took the number
-- that was already live, proposed it again as if it were new, and set the row
-- back to pending. The approval had happened; the next save reversed it. That
-- is the "I approve it and it comes back" in full.
--
-- Measured before writing this: twenty rows carried an approved number and a
-- phone_pending that was digit-for-digit the same number, every one of them
-- stamped 'admin edit, unreviewed'. Not one was a genuine proposal.
--
-- ── why this is not an approval ─────────────────────────────────────────
-- The gate from 0004 says no number becomes dialable without a person. This
-- makes nothing dialable. venues.phone is not read or written here; every row
-- touched already has that exact number live, approved by a human, and keeps
-- it. What is cleared is a duplicate proposal of a number that is already
-- approved, and what is restored is the phone_status that described the row
-- before an accident overwrote it. The digits comparison is the safeguard: a
-- pending number that differs from the live one by so much as a digit is a
-- real proposal and is left alone for review.

update public.venues set
  phone_pending = null,
  phone_status = 'approved',
  phone_source = 'approved earlier; a venue edit re-proposed the same number, reverted in 0028'
where phone_status = 'pending'
  and phone is not null
  and phone <> ''
  and phone_pending is not null
  -- Digits only, so '+233 55 401 3141' and '0554013141' are not mistaken for
  -- two different numbers, and neither is a reformatted copy of one number.
  and regexp_replace(phone_pending, '\D', '', 'g')
      = regexp_replace(phone, '\D', '', 'g')
  and regexp_replace(phone, '\D', '', 'g') <> '';

-- The same duplicate landed in venue_phones, where 0024 had already recorded
-- the approved number as 'Main'. Any 'pending' row there whose number matches
-- an approved 'Main' for the same venue is that duplicate.
delete from public.venue_phones p
where p.status = 'pending'
  and exists (
    select 1 from public.venue_phones q
    where q.venue_id = p.venue_id
      and q.status = 'approved'
      and q.id <> p.id
      and regexp_replace(q.number, '\D', '', 'g')
          = regexp_replace(p.number, '\D', '', 'g')
  );
