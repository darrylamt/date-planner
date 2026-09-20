-- How to reach the person making the cake.
--
-- A pickup is the one part of a plan aduro cannot arrange: the flowers have
-- to be ordered and the cake has to be asked for, often a day ahead, and the
-- app has been showing people a vendor and a price with no way to contact
-- them. gift_vendors has held a phone and an Instagram handle since 0016 and
-- neither has ever reached the app.
--
-- ── why WhatsApp is its own column, again ───────────────────────────────
-- The same reason venues.whatsapp_phone exists. Opening wa.me with whatever
-- is in `phone` assumes a Ghanaian mobile is a WhatsApp account, and mostly
-- it is not: most of these are lines somebody answers. A message sent to an
-- account that does not exist fails without telling anybody, which for a cake
-- ordered two days before a birthday is the worst possible way to find out.
--
-- So the vendor says which they take, and null means ring them.
alter table public.gift_vendors
  add column if not exists whatsapp_phone text;

comment on column public.gift_vendors.whatsapp_phone is
  'The number that takes orders by message, where they take them that way. Null means ring the phone column instead, and is the common case.';
