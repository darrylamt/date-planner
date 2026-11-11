-- What a visitor from outside Ghana pays to get in (owner, 4 Nov 2026: "for
-- foreigners there are different prices... should we make a provision for
-- that?"; built 11 Nov 2026).
--
-- The castles and museums charge non-Ghanaians about four times what
-- Ghanaians pay (GMMB: Cape Coast Castle GH¢20 / GH¢80). entry_fee_ghs stays
-- the Ghanaian adult price; this is the non-Ghanaian adult price beside it.
-- A plan or trip made with "I'm visiting Ghana" switched on charges this one
-- where it is known, and the Ghanaian price where it is not.
--
-- Null means nobody has recorded a separate visitor price, not that visitors
-- go free. Readable like the other public venue columns (0014).

alter table public.venues
  add column if not exists entry_fee_visitor_ghs numeric(10, 2)
    check (entry_fee_visitor_ghs is null or entry_fee_visitor_ghs >= 0);

grant select (entry_fee_visitor_ghs) on public.venues to anon, authenticated;
