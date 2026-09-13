-- Vibe tags for the catalogue, so the chips on screen mean something.
--
-- The plan flow offers fourteen vibes. matching.ts, which is the half that
-- decides which venues the model is shown at all, knew how to translate six of
-- them; planner.ts had a second, different map that knew eight. The other
-- eight fell through to a literal tag lookup, and no venue row had ever
-- carried a `beach`, `dancing`, `sporty`, `outdoorsy`, `artsy` or `foodie`
-- tag, so choosing Beach got a shortlist ranked as though no vibe had been
-- asked for. Not an error anybody would see: just a plan with no beach in it.
--
-- The code half of that fix is in catalog.ts, which now holds one vocabulary
-- and one chip-to-tag map that matching.ts and planner.ts both read. This is
-- the data half: the tags themselves, without which the new words match
-- nothing.
--
-- ── how these were chosen ───────────────────────────────────────────────
-- Rules over each venue's name and description, so every tag is a claim about
-- a real place rather than a guess:
--
--   beach/outdoorsy/scenic  a beach, shore or seaside in the name
--   artsy                   art, gallery, museum, paint, pottery, tufting
--   outdoorsy               park, garden, botanic, canopy, nature, island
--   scenic                  rooftop, sky bar, panoramic, a view
--   foodie                  ramen, sushi, bistro, gourmet, chef, tasting,
--                           fine dining, traditional, cuisine
--   sporty/adventurous      padel, tennis, golf, bowling, pilates, gym,
--                           squash, sport, AND typed as an activity
--   dancing                 a named list of night venues
--   upscale/foodie          price_band = premium
--
-- Four of those rules started wider and were narrowed after reading what they
-- actually matched: "crafted drinks" made Sip Gourmet artsy, "bookings" made
-- S2 Sport Club calm, a pub with the football on made The Honeysuckle sporty,
-- and a "garden-style terrace" gave The Buka a view it has not got. Sport
-- needs the activity type because sport is something you do, not something on
-- a screen, and `dancing` is a list rather than a keyword because Achimota
-- Golf Club, S2 Sport Club, Mamba Club, Aura Lifestyle Club, Polo Beach Club
-- and The Padel Club Ghana are all clubs and not one of them has a floor.
--
-- Where a rule had nothing to say, a venue is topped up from its type to three
-- tags at most: a cafe is calm/casual/chill, a lounge lively/casual, a
-- restaurant only casual, because restaurants are the type that varies most
-- and inventing character for one is worse than leaving it plain. That is why
-- 38 rows still carry one or two tags: they are the venues with no
-- description, and the honest fix for those is the research tool, one at a
-- time, not a wider regex.
--
-- ── on the shape of this migration ──────────────────────────────────────
-- Explicit per-venue lists rather than the rules re-expressed in SQL. The
-- rules ran once, their output was read, and this is that output. Rewriting
-- twelve regexes in Postgres would have given two implementations to keep in
-- step and no way to tell which one the catalogue actually reflects.
--
-- Matched on name, so a venue that has since been renamed is skipped rather
-- than mis-tagged, and re-running sets the same values.

update public.venues v set vibe_tags = x.tags
from (values
  ('Accra Art District', array['fun', 'chill', 'adventurous', 'lively', 'artsy']),
  ('Achimota Golf Club', array['calm', 'adventurous', 'fun', 'lively', 'casual']),
  ('Arcadia (Spintex)', array['fun', 'lively', 'casual']),
  ('Arcadia (West Hills Mall)', array['fun', 'lively', 'casual']),
  ('Arena 233', array['fun', 'chill', 'lively', 'sporty', 'adventurous']),
  ('Aura Lifestyle Club', array['fun', 'adventurous', 'lively', 'casual', 'sporty']),
  ('Bliss Family Entertainment', array['fun', 'lively', 'adventurous', 'casual', 'outdoorsy']),
  ('Cypher Zone', array['fun', 'lively', 'calm', 'chill', 'sporty']),
  ('Game It Up', array['fun', 'lively', 'casual']),
  ('Ghud Park', array['fun', 'chill', 'outdoorsy', 'lively']),
  ('Glaze Art Studio', array['fun', 'chill', 'calm', 'artsy']),
  ('Kwame Nkrumah Memorial Park', array['outdoorsy', 'fun', 'casual']),
  ('Mamba Club', array['fun', 'adventurous', 'sporty']),
  ('National Museum of Ghana', array['artsy', 'fun', 'casual']),
  ('P4 (Airport)', array['fun', 'casual']),
  ('Padel Town', array['fun', 'adventurous', 'sporty']),
  ('Padel Up', array['fun', 'adventurous', 'sporty']),
  ('Padel Zone', array['fun', 'adventurous', 'lively', 'sporty']),
  ('S2 Sport Club', array['fun', 'adventurous', 'sporty']),
  ('Shornaa Island Amusement Park', array['outdoorsy', 'fun', 'lively']),
  ('The Padel Club Ghana', array['fun', 'adventurous', 'sporty']),
  ('The Pilates Studio Accra', array['sporty', 'adventurous', 'fun']),
  ('WINE & ART (Sip and Paint)', array['fun', 'chill', 'romantic', 'artsy']),
  ('Blooming V cafe', array['calm', 'casual', 'chill']),
  ('Bosphorus Restaurant & Cafe', array['calm', 'casual', 'chill']),
  ('Cuppa Cappuccino', array['calm', 'casual', 'chill']),
  ('D Cafe', array['calm', 'casual', 'chill']),
  ('Daddy boba', array['fun', 'casual', 'calm', 'chill']),
  ('Dear Lola Bakehouse', array['casual', 'chill', 'calm']),
  ('Jamestown Coffee Company (AnC Mall)', array['calm', 'casual', 'chill']),
  ('La Boul’', array['calm', 'casual', 'chill']),
  ('Moka''s Resto Cafe', array['foodie', 'calm', 'casual']),
  ('North Ridge Cafe & Bistro', array['foodie', 'calm', 'casual']),
  ('Pâte à choux', array['calm', 'casual', 'scenic', 'fun']),
  ('Second Cup - Dzorwulu', array['calm', 'casual', 'chill']),
  ('TEN25 CAFE', array['calm', 'casual', 'chill']),
  ('The Cupcake Boutique (East Legon)', array['casual', 'chill', 'calm']),
  ('The Cupcake Boutique (Labone)', array['casual', 'chill', 'calm']),
  ('The Good Baker', array['casual', 'chill', 'calm']),
  ('The Good Baker - Dzorwulu', array['casual', 'chill', 'calm']),
  ('Vida e Caffe - Cantonments', array['calm', 'casual', 'chill']),
  ('vida e caffè - East Legon', array['calm', 'casual', 'chill']),
  ('Vida e Caffe - Labone', array['calm', 'casual', 'chill']),
  ('Vida e Caffe - Spintex', array['calm', 'casual', 'chill']),
  ('Chocolate Sarayı', array['casual', 'chill', 'fun']),
  ('Snowman - Airport Residential', array['casual', 'chill', 'fun']),
  ('Snowman - East Legon', array['casual', 'chill', 'fun']),
  ('Snowman - North Kaneshie', array['casual', 'chill', 'fun']),
  ('Snowman - Osu', array['casual', 'chill', 'fun']),
  ('The Tipsy Gelato', array['casual', 'chill', 'fun']),
  ('Aria Accra', array['fun', 'lively', 'casual', 'dancing']),
  ('ASANA Bar & Kitchen', array['upscale', 'foodie', 'lively']),
  ('Beehive Accra', array['dancing', 'lively', 'casual']),
  ('Enzo', array['dancing', 'lively', 'upscale', 'foodie']),
  ('Front/Back', array['dancing', 'lively', 'casual']),
  ('KLAP', array['dancing', 'lively', 'upscale', 'foodie']),
  ('Level Bar & Lounge', array['dancing', 'lively', 'casual']),
  ('MAD CLUB', array['fun', 'lively', 'casual', 'dancing', 'upscale']),
  ('Mood Bar', array['dancing', 'lively', 'casual']),
  ('OX ULTRA LOUNGE', array['dancing', 'lively', 'casual']),
  ('Pit Stop', array['dancing', 'lively', 'casual']),
  ('Shuko Bar & Lounge', array['dancing', 'lively', 'casual']),
  ('Sky Bar 25 Restaurant and Bar', array['romantic', 'lively', 'scenic', 'upscale', 'foodie']),
  ('The Honeysuckle - Osu', array['lively', 'fun', 'casual']),
  ('The Republic Bar & Grill - Osu Main Station', array['lively', 'fun', 'casual', 'upscale']),
  ('Venus Lounge Bar and Grill', array['lively', 'casual']),
  ('Aburi Botanical Gardens & Park', array['lively', 'fun', 'adventurous', 'casual', 'scenic']),
  ('355 Restaurant and Lounge', array['calm', 'romantic', 'casual']),
  ('After', array['casual']),
  ('Alora Beach Resort', array['beach', 'outdoorsy', 'scenic']),
  ('Aya Restaurant', array['calm', 'romantic', 'upscale', 'foodie']),
  ('BABEL RESTAURANT GHANA', array['casual']),
  ('Baobab Traditional Restaurant', array['foodie', 'casual']),
  ('Binkabi Restaurant', array['upscale', 'foodie', 'casual']),
  ('Bistro 22', array['romantic', 'lively', 'casual', 'foodie', 'upscale']),
  ('Bold Restaurant Ghana', array['casual']),
  ('Brown Sugar Lounge and Restaurant', array['casual']),
  ('Cafe-Bar Noir', array['calm', 'romantic', 'casual']),
  ('CafeClair', array['casual']),
  ('Capitol Cafe & Restaurant', array['casual', 'chill']),
  ('Casa1715', array['calm', 'romantic', 'upscale', 'foodie']),
  ('Citrus Restaurant & Lounge', array['casual']),
  ('Coco Eats', array['casual', 'chill', 'lively', 'upscale', 'foodie']),
  ('Crystal Palm Hotels', array['casual']),
  ('Dragon room', array['romantic', 'adventurous', 'casual']),
  ('Dstrkt 24 | District 24', array['casual']),
  ('e-Ananse Library', array['calm', 'chill', 'casual']),
  ('Elm Café at The Lennox', array['casual']),
  ('Flicks & Licks - Dansoman', array['lively', 'casual', 'fun']),
  ('Flicks & Licks - East Legon', array['lively', 'casual', 'fun']),
  ('Flicks & Licks - Kingsby Achimota', array['lively', 'casual', 'fun']),
  ('Flicks & Licks - Mile 7', array['lively', 'casual', 'fun']),
  ('FOOD GARAGE', array['casual']),
  ('Fugo Bar And Restaurant', array['casual']),
  ('Je Me Régale', array['romantic', 'calm', 'upscale', 'foodie']),
  ('Koffee Lounge (A&C Mall)', array['casual']),
  ('Koffee Lounge (American House)', array['casual']),
  ('Kula Bistro', array['foodie', 'casual']),
  ('Laboma Beach Resort', array['beach', 'outdoorsy', 'scenic']),
  ('Langma Beach', array['beach', 'outdoorsy', 'scenic']),
  ('Le Pavillon Restaurant', array['romantic', 'calm', 'casual', 'chill', 'lively']),
  ('Lets tuft 101 Limited', array['artsy', 'casual']),
  ('LI BEIRUT', array['casual']),
  ('Liv Resto Lounge', array['foodie', 'casual']),
  ('manpuku ramen bar', array['foodie', 'casual']),
  ('Nnipa', array['romantic', 'calm', 'upscale', 'foodie']),
  ('Noble House - Dansoman', array['calm', 'casual']),
  ('Noble House - Spintex', array['casual', 'lively']),
  ('Noble House Restaurant - East Legon', array['casual', 'lively']),
  ('Oliver Twist Shack', array['calm', 'casual']),
  ('Palace Chinese Restaurant', array['romantic', 'calm', 'foodie', 'upscale']),
  ('Pink Flamingo Beach Club', array['beach', 'outdoorsy', 'scenic']),
  ('Pinocchio Pizzeria & Gelateria - East Legon', array['romantic', 'casual', 'chill', 'upscale', 'foodie']),
  ('Pinocchio Pizzeria & Gelateria - Osu', array['romantic', 'casual', 'chill', 'upscale', 'foodie']),
  ('Polo Beach Club', array['beach', 'outdoorsy', 'scenic']),
  ('RITUAL - Cafe, Cocktail and Listening Bar', array['lively', 'upscale', 'casual']),
  ('Sage Restaurant', array['casual']),
  ('Saint Pablo Restaurant', array['calm', 'romantic', 'upscale', 'foodie']),
  ('Sandbox Beach Club', array['beach', 'outdoorsy', 'scenic']),
  ('SI BEACH CLUB', array['beach', 'outdoorsy', 'scenic']),
  ('Sip Gourmet', array['romantic', 'calm', 'foodie', 'upscale']),
  ('Starbites Dansoman', array['casual']),
  ('Starbites East Legon', array['casual']),
  ('Tea Baa GH', array['calm', 'casual', 'upscale', 'foodie']),
  ('The Buka Restaurant', array['calm', 'lively', 'outdoorsy', 'upscale', 'foodie']),
  ('The Chop Bar - Achimota Mall', array['casual', 'lively']),
  ('The Corridor Gardens Restaurant and Bar', array['outdoorsy', 'casual']),
  ('The Honeysuckle - Airport', array['lively', 'casual', 'fun']),
  ('The Honeysuckle - East Legon', array['lively', 'casual', 'fun']),
  ('The Honeysuckle - Labone', array['lively', 'casual', 'fun']),
  ('The Honeysuckle - Spintex', array['lively', 'casual', 'fun']),
  ('The Living Room Restaurant', array['casual']),
  ('The Mandem', array['casual']),
  ('The Yambar', array['romantic', 'lively', 'upscale', 'foodie']),
  ('Tomato', array['romantic', 'calm', 'casual', 'chill', 'upscale']),
  ('Treehouse Restaurant', array['casual']),
  ('Tunnel Lounge', array['lively', 'romantic', 'calm', 'dancing', 'upscale']),
  ('ULA Beach Club', array['calm', 'lively', 'romantic', 'casual', 'beach']),
  ('YAYA La Parisienne', array['casual']),
  ('YnY Restaurant & Cafe', array['casual']),
  ('Zee Lounge', array['casual']),
  ('Zen Garden', array['outdoorsy', 'casual'])
) as x(name, tags)
where v.name = x.name
  and v.vibe_tags <> x.tags;
