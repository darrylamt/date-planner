-- Plan generation has been failing for everyone. This is why.
--
-- Migrations 0013 and 0014 replaced the blanket `grant select on venues` with
-- an explicit column list, to stop unapproved phone numbers being readable.
-- That was right. What it also did was turn the venue grant into a denylist
-- that silently breaks on every column added afterwards.
--
-- 0015 then added price_source and price_spread and did not grant them.
-- fetchCandidates runs `select("*", areas(name))` as the caller, and Postgres
-- refuses `SELECT *` outright when any single column is ungranted, rather than
-- quietly returning the rest. So every plan request has been coming back
-- "We couldn't reach the venue catalog."
--
-- Verified against the live database with the anon key that ships in the app:
--   select=aesthetics    -> 200
--   select=price_source  -> 42501 permission denied
--   select=*             -> 42501 permission denied
-- and the same as `authenticated`, since 0014 narrowed that role to match.
--
-- These two columns are safe to expose and were always meant to be. They are
-- what tells someone a price is an estimate rather than a figure read off a
-- menu, so withholding them from the client is precisely backwards: it would
-- present an estimated total as though it were exact.

grant select (price_source, price_spread) on public.venues to anon;
grant select (price_source, price_spread) on public.venues to authenticated;
