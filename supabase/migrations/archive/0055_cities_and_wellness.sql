-- Cities that mean something, and a kind of venue for spas.
--
-- RUN THIS ON ITS OWN, THEN RUN 0056. Postgres will not let a new enum value
-- be used in the same transaction that adds it, and the SQL editor runs a
-- file as one transaction, so pasting both together fails on 0056's first
-- line with "unsafe use of new value".

-- ── 1. country, beside the city that areas already had ─────────────────
--
-- areas.city has existed since 0001 and nothing read it. Kumasi arrived as a
-- neighbourhood of Accra -- city 'Accra', between Kpeshie and La -- and
-- "Surprise me" drew on every area there was, so a one-stop plan could put
-- somebody in Osu at a table in Kumasi. The planner now scopes every plan to
-- one city, and Kumasi has been moved into its own.
--
-- Country is added now and read by nothing yet, on purpose. It is what London
-- will need -- the currency, the fare model and the timezone all follow the
-- country rather than the city -- and adding the column ahead of the code that
-- reads it is the safe order. The reverse, code selecting a column the
-- database does not have, is how plan generation went down twice (see the
-- comment on the venue query in matching.ts).
alter table public.areas
  add column if not exists country text not null default 'Ghana';

comment on column public.areas.city is
  'The city a plan is scoped to. Every plan stays inside one; "Surprise me" means anywhere in the city, never anywhere at all.';
comment on column public.areas.country is
  'Reserved for the first city outside Ghana. Currency, transport fares and timezone key off this; nothing reads it yet.';

-- ── 2. wellness ────────────────────────────────────────────────────────
--
-- Spas were filed as activities, so to a type-blind shortlist a deep-tissue
-- massage and a game of bowling were the same kind of stop, and a family day
-- or a table of eight friends could be sent to either. As their own type they
-- are withheld from every plan unless somebody asks for one, and they only
-- can for one or two people.
alter type public.venue_type add value if not exists 'wellness';
