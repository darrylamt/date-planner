-- Four venues with a real menu, marked as having no price at all.
--
-- fetchCandidates withholds a venue whose price_source is 'unknown', and does
-- so before it looks at anything else:
--
--   if (v.price_source === "unknown") return false;
--
-- That rule is right. An unpriced venue left in is the cheapest option in
-- every search, so it wins constantly and lands in plans at GHS 0, which
-- quietly makes the whole budget meaningless. "We do not know" has to mean
-- withheld, or the budget stops meaning anything.
--
-- But it is only right when the flag is true, and on four rows it was not:
--
--     10 items  Arena 233
--    247 items  Cuppa Cappuccino
--    182 items  The Honeysuckle - Osu
--     49 items  Tunnel Lounge
--
-- Every one of them has a full priced menu on file and has been invisible to
-- every plan ever generated. The Honeysuckle - Osu is the worst of the four:
-- it is the menu owner for five branches, so the best-stocked row in the
-- catalogue has been silently unreachable.
--
-- Found by chasing a different bug. Tunnel Lounge holds the only weekly
-- fixture in the catalogue, and when the planner finally learned to read
-- fixtures it still would not use it, because the venue was withheld for this
-- unrelated reason. That is what makes this class of error expensive: nothing
-- errors, nothing logs, the venue simply never appears, and the only way to
-- notice is to go looking for a venue you expected to see.
--
-- ── what this changes and what it does not ──────────────────────────────
-- Only rows that have priced menu items to point at, counting a shared menu
-- the way the planner counts it: a branch is priced by its owner's list, so
-- the test follows menu_shared_from rather than looking only at the row's own
-- items.
--
-- price_source becomes 'menu' rather than 'estimated', because that is what it
-- is: the price comes from menu rows, so a plan built on it is exact rather
-- than a range. Nothing here invents a price, changes a price, or touches the
-- 83 venues that genuinely have none. Those stay withheld, which is correct,
-- and they are a gap in the catalogue rather than a bug in this flag.

update public.venues v
set price_source = 'menu'
where v.is_active
  and v.price_source = 'unknown'
  and exists (
    select 1
    from public.menu_items m
    -- The owner's list where this venue borrows one, its own otherwise, which
    -- is exactly how the planner decides whether a venue has a price.
    where m.venue_id = coalesce(v.menu_shared_from, v.id)
      and m.price_ghs > 0
  );
