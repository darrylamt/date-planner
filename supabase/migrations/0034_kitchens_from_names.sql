-- The kitchens a venue's own name states outright.
--
-- Nineteen of a hundred and sixty-one, and that number is the point.
--
-- ── what was tried first ────────────────────────────────────────────────
-- Reading descriptions as well as names doubled the coverage to fifty and
-- filled it with things that are not true. A burger shop whose blurb mentions
-- shawarma and suya came back Lebanese and Nigerian. "Bistro" in three names
-- made three venues French. "D Cafe" matched on the word cafe and came back
-- Italian and French at once.
--
-- A dish on the menu is not the kitchen, and this is the field the assistant
-- quotes as fact when somebody asks where to get Korean food. Fifty rows half
-- of which are wrong is worse than nineteen that are right, because the
-- nineteen can be trusted and the fifty would have to be checked one at a
-- time, which is the work the rules were meant to save.
--
-- ── what this cannot do ─────────────────────────────────────────────────
-- Pomona is Italian and nothing in the string "Pomona" says so. That is
-- knowledge about a place, not a pattern in its name, and there is no honest
-- way to derive it here: web search is capped on the account, and guessing
-- would put an invention in the one field somebody searching for Italian food
-- would rely on.
--
-- So the other hundred and forty-two are left empty, which reads as "nobody
-- has recorded a kitchen" rather than "this place has none", and the admin
-- has a screen for filling them in a sitting rather than a venue at a time.
--
-- Matched on name, so a renamed venue is skipped rather than mis-tagged, and
-- only where nothing has been recorded already: a person's answer outranks a
-- pattern.

update public.venues v set cuisines = x.kitchens
from (values
  ('Arirang restaurant Korean Dining',            array['korean']),
  ('Asanka Avenue Restaurant',                    array['ghanaian']),
  ('Buddyz Bar & Grill',                          array['grill']),
  ('Chiq-N-Grill',                                array['grill']),
  ('Daddy boba',                                  array['coffee']),
  ('Dear Lola Bakehouse',                         array['bakery']),
  ('Jamestown Coffee Company (AnC Mall)',         array['coffee']),
  ('Kaya Afro-Caribbean bistro',                  array['caribbean']),
  ('manpuku ramen bar',                           array['japanese']),
  ('Palace Chinese Restaurant',                   array['chinese']),
  ('Pinocchio Pizzeria & Gelateria - East Legon', array['italian']),
  ('Pinocchio Pizzeria & Gelateria - Osu',        array['italian']),
  ('The Chop Bar - Achimota Mall',                array['ghanaian']),
  ('The Cupcake Boutique (East Legon)',           array['bakery']),
  ('The Cupcake Boutique (Labone)',               array['bakery']),
  ('The Good Baker',                              array['bakery']),
  ('The Good Baker - Dzorwulu',                   array['bakery']),
  ('The Republic Bar & Grill - Osu Main Station', array['grill']),
  ('Venus Lounge Bar and Grill',                  array['grill'])
) as x(name, kitchens)
where v.name = x.name
  and coalesce(array_length(v.cuisines, 1), 0) = 0;
