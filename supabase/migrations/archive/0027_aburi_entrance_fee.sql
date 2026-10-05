-- Aburi Botanical Gardens has a price, and it is an entrance fee.
--
-- The row had avg_cost_per_person_ghs = 0, price_source = 'estimated' and no
-- menu items, which is the combination that means "withheld from planning".
-- A canopy of two-hundred-year-old trees an hour out of Accra was in the
-- catalogue and unreachable by any plan.
--
-- ── what the fee actually is ────────────────────────────────────────────
-- GHS 20 for a Ghanaian adult, and it is worth being honest about how well
-- that is known. The gardens have no website. The only source giving a full
-- tiered schedule is the Ghana-Net heritage guide, which lists Ghanaian adult
-- 20, Ghanaian student 3, non-Ghanaian adult 60, non-Ghanaian student 40, and
-- marks it as the 2025 rates. Other listings say 5/10 and 10/20, and the 5/10
-- pair appears on several aggregators that copy one another, which is the same
-- trap the phone review warns about: one old figure reprinted enough times
-- looks like corroboration.
--
-- So the figure goes in, and price_source stays 'estimated' rather than
-- 'menu'. That is not hedging, it is the column doing its job: 'estimated'
-- makes the planner show the stop as a range instead of an exact number
-- (planner.ts widens any total containing an estimated stop), which is
-- precisely the right claim for a gate fee nobody here has paid in person.
-- Confirm it at the gate and set price_source = 'menu' at that point.
--
-- ── the menu item ──────────────────────────────────────────────────────
-- One row, category 'other', which is the shape the Unpriced screen writes and
-- the shape the planner reads for a flat entry fee, per the note in
-- catalog.ts. It is also what gives the venue a real updated_at, so it ages
-- like every other price and comes back for review in ninety days. A fee with
-- no timestamp is a fee nobody is ever reminded to check.

update public.venues set
  avg_cost_per_person_ghs = 20,
  price_source = 'estimated',
  price_spread = 0.3,
  -- Not free, and the distinction matters: is_free would carry the stop at
  -- zero and the check constraint from 0005 forbids a free venue with a cost.
  is_free = false,
  pricing_mode = 'per_person',
  unit_price_ghs = null,
  description = case
    when coalesce(description, '') = ''
    then 'Colonial-era botanical gardens on the Akuapem ridge, about an hour north of Accra. Palm avenues, a drum-shaped helicopter shell in the trees and air several degrees cooler than the city. One entrance fee, open eight until five daily.'
    else description end,
  -- Left as an empty string by an earlier admin save, which is not the same as
  -- "no number on file" and made the row look like it had one.
  phone = nullif(phone, '')
where name = 'Aburi Botanical Gardens & Park';

insert into public.menu_items (venue_id, name, category, price_ghs, covers_people, notes)
select v.id, 'Entry, per person', 'other', 20, 1,
       'Ghanaian adult rate. Non-Ghanaian adults are charged more, around 60. Not confirmed at the gate.'
from public.venues v
where v.name = 'Aburi Botanical Gardens & Park'
  and not exists (
    select 1 from public.menu_items m
    where m.venue_id = v.id and m.name = 'Entry, per person'
  );
