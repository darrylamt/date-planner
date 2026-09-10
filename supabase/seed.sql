-- ⚠️  PLACEHOLDER DATA, DO NOT RUN AGAINST PRODUCTION ⚠️
--
-- The 25 venues below are INVENTED. They are not real Accra businesses, and
-- every price is made up. This file exists only so a fresh clone has
-- something to click through locally.
--
-- Production was cleared of this data on 2026-09-05. To load a real catalog,
-- see supabase/templates/README.md and import at /admin/import.
--
-- aduro, seed data
-- ⚠️ ALL PRICES BELOW ARE PLACEHOLDERS, to be replaced with researched, venue-confirmed data.
-- Venue names are plausible Accra-style venues for development and demos.
-- Events are seeded relative to the current date so the demo always has active events.

-- ── Areas ────────────────────────────────────────────────────────────────
insert into public.areas (id, name, city) values
  ('a1000000-0000-0000-0000-000000000001', 'Osu', 'Accra'),
  ('a1000000-0000-0000-0000-000000000002', 'Labone', 'Accra'),
  ('a1000000-0000-0000-0000-000000000003', 'East Legon', 'Accra'),
  ('a1000000-0000-0000-0000-000000000004', 'Cantonments', 'Accra'),
  ('a1000000-0000-0000-0000-000000000005', 'Airport Residential', 'Accra'),
  ('a1000000-0000-0000-0000-000000000006', 'Spintex', 'Accra'),
  ('a1000000-0000-0000-0000-000000000007', 'Dzorwulu', 'Accra'),
  ('a1000000-0000-0000-0000-000000000008', 'Achimota', 'Accra');

-- ── Venues (25: 11 restaurants, 2 lounges, 7 activities/outdoor, 5 cafe/dessert) ──
insert into public.venues
  (id, name, type, area_id, vibe_tags, dress_code, price_band, avg_cost_per_person_ghs, description, best_for, reservation_required, instagram_handle, phone, google_maps_url, image_url, lat, lng) values

-- Restaurants
('b2000000-0000-0000-0000-000000000001', 'Maame''s Table', 'restaurant', 'a1000000-0000-0000-0000-000000000001',
 '{romantic,calm,scenic}', 'Smart casual', 'mid', 180,
 'Ghanaian seafood on an open-air deck by the water. Grilled tilapia is the house pride; ask for the deck table at sunset.',
 '{anniversary,date_night,first_date}', true, '@maamestable', '+233 20 000 0001', 'https://maps.google.com/?q=Maame''s+Table+Osu',
 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=70', 5.5560, -0.1830),

('b2000000-0000-0000-0000-000000000002', 'Chalé Bites', 'restaurant', 'a1000000-0000-0000-0000-000000000003',
 '{lively,fun,casual}', null, 'mid', 130,
 'A modern chop bar doing Ghanaian classics with a twist, jollof flights, kelewele tacos and a loud, happy crowd.',
 '{casual_hangout,friend_outing,date_night}', false, '@chalebites', '+233 20 000 0002', 'https://maps.google.com/?q=Chale+Bites+East+Legon',
 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=70', 5.6350, -0.1640),

('b2000000-0000-0000-0000-000000000003', 'Nima Nights Grill', 'restaurant', 'a1000000-0000-0000-0000-000000000005',
 '{lively,casual,fun}', null, 'mid', 160,
 'Charcoal suya, khebabs and grilled guinea fowl served late into the night with Afrobeats on the speakers.',
 '{casual_hangout,friend_outing,date_night}', false, '@nimanightsgrill', '+233 20 000 0003', 'https://maps.google.com/?q=Nima+Nights+Grill+Airport',
 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=70', 5.6020, -0.1780),

('b2000000-0000-0000-0000-000000000004', 'La Baraka', 'restaurant', 'a1000000-0000-0000-0000-000000000002',
 '{calm,upscale,romantic}', 'Smart casual', 'premium', 260,
 'Family-run Lebanese dining room with warm lighting, generous mezze platters and quiet corner tables.',
 '{anniversary,date_night}', true, '@labarakaaccra', '+233 20 000 0004', 'https://maps.google.com/?q=La+Baraka+Labone',
 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1200&q=70', 5.5670, -0.1720),

('b2000000-0000-0000-0000-000000000005', 'Zen Garden Pan-Asian', 'restaurant', 'a1000000-0000-0000-0000-000000000004',
 '{romantic,upscale,calm,scenic}', 'Smart casual', 'premium', 300,
 'Lantern-lit garden dining with sushi, dim sum and wok classics, one of the prettiest courtyards in Cantonments.',
 '{anniversary,date_night}', true, '@zengardenaccra', '+233 20 000 0005', 'https://maps.google.com/?q=Zen+Garden+Cantonments',
 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=70', 5.5790, -0.1750),

('b2000000-0000-0000-0000-000000000006', 'The Buka House', 'restaurant', 'a1000000-0000-0000-0000-000000000001',
 '{lively,casual,fun}', null, 'mid', 140,
 'West African favourites, banku, okro soup, asaro and party jollof, in a buzzing courtyard off Oxford Street.',
 '{casual_hangout,friend_outing,first_date}', false, '@thebukahouse', '+233 20 000 0006', 'https://maps.google.com/?q=Buka+House+Osu',
 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=70', 5.5575, -0.1815),

('b2000000-0000-0000-0000-000000000007', 'Tandoor Villa', 'restaurant', 'a1000000-0000-0000-0000-000000000003',
 '{calm,casual,romantic}', null, 'mid', 170,
 'North Indian kitchen known for butter chicken, fresh naan and a leafy terrace that stays cool in the evening.',
 '{date_night,first_date}', false, '@tandoorvilla', '+233 20 000 0007', 'https://maps.google.com/?q=Tandoor+Villa+East+Legon',
 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1200&q=70', 5.6330, -0.1615),

('b2000000-0000-0000-0000-000000000008', 'Skyline 360', 'restaurant', 'a1000000-0000-0000-0000-000000000005',
 '{romantic,upscale,scenic}', 'Dressy', 'premium', 320,
 'Rooftop fine dining with a wraparound view of the Accra skyline. Come for golden hour, stay for dessert.',
 '{anniversary,date_night}', true, '@skyline360accra', '+233 20 000 0008', 'https://maps.google.com/?q=Skyline+360+Airport+City',
 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=70', 5.6050, -0.1790),

('b2000000-0000-0000-0000-000000000009', 'Auntie Efua''s Waakye Spot', 'restaurant', 'a1000000-0000-0000-0000-000000000008',
 '{casual,fun,lively}', null, 'budget', 60,
 'Legendary morning-to-afternoon waakye with all the fixings, gari, wele, spaghetti and shito that bites back.',
 '{casual_hangout,friend_outing}', false, null, '+233 20 000 0009', 'https://maps.google.com/?q=Waakye+Achimota',
 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=70', 5.6180, -0.2290),

('b2000000-0000-0000-0000-000000000010', 'Tilapia Republic', 'restaurant', 'a1000000-0000-0000-0000-000000000006',
 '{lively,casual,fun}', null, 'budget', 110,
 'Grilled tilapia and banku done properly, with pepper you choose by heat level and highlife on the radio.',
 '{casual_hangout,date_night,friend_outing}', false, '@tilapiarepublic', '+233 20 000 0010', 'https://maps.google.com/?q=Tilapia+Republic+Spintex',
 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=70', 5.6340, -0.1010),

('b2000000-0000-0000-0000-000000000011', 'Vine & Stone Trattoria', 'restaurant', 'a1000000-0000-0000-0000-000000000003',
 '{romantic,calm,upscale}', 'Smart casual', 'premium', 280,
 'Hand-made pasta, wood-fired pizza and a softly lit stone courtyard made for long conversations.',
 '{anniversary,date_night,first_date}', true, '@vineandstone', '+233 20 000 0011', 'https://maps.google.com/?q=Vine+and+Stone+East+Legon',
 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=1200&q=70', 5.6365, -0.1660),

-- Lounges
('b2000000-0000-0000-0000-000000000012', 'Highlife House', 'lounge', 'a1000000-0000-0000-0000-000000000002',
 '{calm,romantic,fun}', null, 'mid', 120,
 'A vinyl listening bar spinning old highlife and palm-wine records, with desserts and low-proof cocktails.',
 '{date_night,anniversary,first_date}', false, '@highlifehouse', '+233 20 000 0012', 'https://maps.google.com/?q=Highlife+House+Labone',
 'https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?auto=format&fit=crop&w=1200&q=70', 5.5665, -0.1710),

('b2000000-0000-0000-0000-000000000013', 'Asa Rooftop', 'lounge', 'a1000000-0000-0000-0000-000000000004',
 '{calm,romantic,scenic}', 'Smart casual', 'mid', 150,
 'A quiet skyline terrace for nightcaps, mocktails, small plates and no loud music, ever.',
 '{anniversary,date_night}', false, '@asarooftop', '+233 20 000 0013', 'https://maps.google.com/?q=Asa+Rooftop+Cantonments',
 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1200&q=70', 5.5800, -0.1760),

-- Activities & outdoor
('b2000000-0000-0000-0000-000000000014', 'Palm Lane Arcade', 'activity', 'a1000000-0000-0000-0000-000000000006',
 '{fun,lively,adventurous}', null, 'mid', 100,
 'Retro and modern arcade games, air hockey and a two-lane mini bowling strip. Winner picks the next stop.',
 '{first_date,casual_hangout,friend_outing}', false, '@palmlanearcade', '+233 20 000 0014', 'https://maps.google.com/?q=Palm+Lane+Arcade+Spintex',
 'https://images.unsplash.com/photo-1511882150382-421056c89033?auto=format&fit=crop&w=1200&q=70', 5.6320, -0.0990),

('b2000000-0000-0000-0000-000000000015', 'Legon Botanical Canopy Walk', 'outdoor', 'a1000000-0000-0000-0000-000000000003',
 '{adventurous,scenic,calm}', 'Comfortable shoes', 'budget', 60,
 'Rope canopy walkway over the gardens, plus kayaks and shaded picnic lawns. Best before 5 PM.',
 '{first_date,casual_hangout,friend_outing}', false, '@legonbotanical', '+233 20 000 0015', 'https://maps.google.com/?q=Legon+Botanical+Gardens',
 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=70', 5.6420, -0.1750),

('b2000000-0000-0000-0000-000000000016', 'Labadi Shore Rides', 'outdoor', 'a1000000-0000-0000-0000-000000000002',
 '{scenic,adventurous,romantic}', null, 'budget', 80,
 'Sunset horse rides and long walks along the shoreline, with coconut sellers on standby.',
 '{first_date,date_night,casual_hangout}', false, null, '+233 20 000 0016', 'https://maps.google.com/?q=Labadi+Beach',
 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=1200&q=70', 5.5610, -0.1580),

('b2000000-0000-0000-0000-000000000017', 'Sip & Stroke Studio', 'activity', 'a1000000-0000-0000-0000-000000000001',
 '{fun,calm,romantic}', null, 'mid', 150,
 'Guided sip-and-paint sessions, two easels side by side, one playlist, zero artistic pressure.',
 '{first_date,date_night,friend_outing}', true, '@sipandstrokegh', '+233 20 000 0017', 'https://maps.google.com/?q=Sip+and+Stroke+Osu',
 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1200&q=70', 5.5550, -0.1800),

('b2000000-0000-0000-0000-000000000018', 'Strike Zone Bowling', 'activity', 'a1000000-0000-0000-0000-000000000004',
 '{fun,lively,adventurous}', null, 'mid', 120,
 'Six lanes, glow nights on weekends, and loser-buys-milkshakes house rules.',
 '{first_date,casual_hangout,friend_outing}', false, '@strikezonegh', '+233 20 000 0018', 'https://maps.google.com/?q=Strike+Zone+Cantonments',
 'https://images.unsplash.com/photo-1538511059256-5f9e29e40ab5?auto=format&fit=crop&w=1200&q=70', 5.5770, -0.1730),

('b2000000-0000-0000-0000-000000000019', 'Regatta Paddle Club', 'outdoor', 'a1000000-0000-0000-0000-000000000006',
 '{adventurous,scenic,calm}', 'Clothes that can get wet', 'mid', 90,
 'Tandem kayaks and pedal boats on the lagoon, calmest in the late afternoon.',
 '{first_date,casual_hangout,date_night}', false, '@regattapaddle', '+233 20 000 0019', 'https://maps.google.com/?q=Regatta+Paddle+Spintex',
 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=70', 5.6290, -0.0950),

('b2000000-0000-0000-0000-000000000020', 'Court One Tennis & Padel', 'activity', 'a1000000-0000-0000-0000-000000000005',
 '{fun,adventurous,lively}', 'Trainers', 'mid', 130,
 'Floodlit padel and tennis courts with rackets to rent and a smoothie bar courtside.',
 '{casual_hangout,friend_outing,first_date}', true, '@courtonegh', '+233 20 000 0020', 'https://maps.google.com/?q=Court+One+Airport',
 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=70', 5.5990, -0.1820),

-- Cafés & dessert
('b2000000-0000-0000-0000-000000000021', 'Lantern Garden Café', 'cafe', 'a1000000-0000-0000-0000-000000000002',
 '{calm,romantic,scenic}', null, 'mid', 90,
 'String-lit courtyard café, coconut cake, spiced cocoa and quiet enough to actually hear each other.',
 '{first_date,date_night,anniversary}', false, '@lanterngarden', '+233 20 000 0021', 'https://maps.google.com/?q=Lantern+Garden+Labone',
 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=70', 5.5680, -0.1700),

('b2000000-0000-0000-0000-000000000022', 'Scoop Culture Gelato', 'dessert', 'a1000000-0000-0000-0000-000000000001',
 '{fun,casual,lively}', null, 'budget', 70,
 'Small-batch gelato with Ghana-first flavours, sobolo sorbet, roasted-plantain caramel, bissap swirl.',
 '{first_date,casual_hangout,date_night}', false, '@scoopculture', '+233 20 000 0022', 'https://maps.google.com/?q=Scoop+Culture+Osu',
 'https://images.unsplash.com/photo-1567206563064-6f60f40a2b57?auto=format&fit=crop&w=1200&q=70', 5.5568, -0.1790),

('b2000000-0000-0000-0000-000000000023', 'Bloom & Bean', 'cafe', 'a1000000-0000-0000-0000-000000000007',
 '{calm,casual,romantic}', null, 'mid', 85,
 'Plant-filled specialty coffee shop pouring single-origin Ghanaian beans, with board games on the shelf.',
 '{first_date,casual_hangout}', false, '@bloomandbean', '+233 20 000 0023', 'https://maps.google.com/?q=Bloom+and+Bean+Dzorwulu',
 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=1200&q=70', 5.6060, -0.1960),

('b2000000-0000-0000-0000-000000000024', 'Chill Factory FroYo', 'dessert', 'a1000000-0000-0000-0000-000000000003',
 '{fun,casual,lively}', null, 'budget', 65,
 'Self-serve frozen yoghurt with a ridiculous toppings wall. Pay by weight, regret nothing.',
 '{casual_hangout,friend_outing,first_date}', false, '@chillfactorygh', '+233 20 000 0024', 'https://maps.google.com/?q=Chill+Factory+East+Legon',
 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=1200&q=70', 5.6340, -0.1630),

('b2000000-0000-0000-0000-000000000025', 'Kukua''s Bakehouse', 'dessert', 'a1000000-0000-0000-0000-000000000008',
 '{calm,casual,fun}', null, 'budget', 75,
 'Neighbourhood bakery famous for bofrot sliders, meat pies and Sunday cinnamon rolls that sell out by noon.',
 '{casual_hangout,first_date}', false, '@kukuasbakehouse', '+233 20 000 0025', 'https://maps.google.com/?q=Kukua+Bakehouse+Achimota',
 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=70', 5.6170, -0.2280);

-- ── Menu items (placeholder prices) ──────────────────────────────────────
insert into public.menu_items (venue_id, name, category, price_ghs, notes) values
-- Maame's Table
('b2000000-0000-0000-0000-000000000001', 'Grilled tilapia & banku', 'main', 95, 'House speciality'),
('b2000000-0000-0000-0000-000000000001', 'Coconut-lime prawns', 'main', 140, null),
('b2000000-0000-0000-0000-000000000001', 'Kelewele to share', 'starter', 40, null),
('b2000000-0000-0000-0000-000000000001', 'Passion-ginger cooler', 'drink', 48, null),
('b2000000-0000-0000-0000-000000000001', 'Toasted coconut sundae', 'dessert', 55, null),
-- Chalé Bites
('b2000000-0000-0000-0000-000000000002', 'Party jollof flight', 'main', 110, 'Three jollof styles'),
('b2000000-0000-0000-0000-000000000002', 'Kelewele tacos (3)', 'starter', 65, null),
('b2000000-0000-0000-0000-000000000002', 'Grilled chicken chalé plate', 'main', 120, null),
('b2000000-0000-0000-0000-000000000002', 'Sobolo spritz', 'drink', 43, null),
-- Nima Nights Grill
('b2000000-0000-0000-0000-000000000003', 'Beef suya platter', 'main', 130, null),
('b2000000-0000-0000-0000-000000000003', 'Grilled guinea fowl (half)', 'main', 150, null),
('b2000000-0000-0000-0000-000000000003', 'Chichinga skewers (4)', 'starter', 70, null),
('b2000000-0000-0000-0000-000000000003', 'Fresh coconut', 'drink', 25, null),
-- La Baraka
('b2000000-0000-0000-0000-000000000004', 'Mezze platter for two', 'starter', 180, null),
('b2000000-0000-0000-0000-000000000004', 'Lamb shawarma plate', 'main', 165, null),
('b2000000-0000-0000-0000-000000000004', 'Mixed grill for two', 'main', 320, null),
('b2000000-0000-0000-0000-000000000004', 'Baklava & mint tea', 'dessert', 85, null),
('b2000000-0000-0000-0000-000000000004', 'Fresh lemon-mint juice', 'drink', 45, null),
-- Zen Garden
('b2000000-0000-0000-0000-000000000005', 'Sushi boat for two', 'main', 380, null),
('b2000000-0000-0000-0000-000000000005', 'Dim sum basket', 'starter', 140, null),
('b2000000-0000-0000-0000-000000000005', 'Wok-fired beef udon', 'main', 190, null),
('b2000000-0000-0000-0000-000000000005', 'Lychee-hibiscus mocktail', 'drink', 60, null),
('b2000000-0000-0000-0000-000000000005', 'Matcha cheesecake', 'dessert', 75, null),
-- The Buka House
('b2000000-0000-0000-0000-000000000006', 'Banku & okro soup', 'main', 90, null),
('b2000000-0000-0000-0000-000000000006', 'Party jollof & chicken', 'main', 105, null),
('b2000000-0000-0000-0000-000000000006', 'Asaro (yam porridge)', 'main', 85, null),
('b2000000-0000-0000-0000-000000000006', 'Chilled palm wine (calabash)', 'drink', 38, null),
-- Tandoor Villa
('b2000000-0000-0000-0000-000000000007', 'Butter chicken & naan', 'main', 145, null),
('b2000000-0000-0000-0000-000000000007', 'Paneer tikka', 'starter', 95, 'Vegetarian'),
('b2000000-0000-0000-0000-000000000007', 'Lamb biryani', 'main', 160, null),
('b2000000-0000-0000-0000-000000000007', 'Mango lassi', 'drink', 40, null),
('b2000000-0000-0000-0000-000000000007', 'Gulab jamun', 'dessert', 50, null),
-- Skyline 360
('b2000000-0000-0000-0000-000000000008', 'Chef''s tasting for two', 'main', 520, 'Five courses'),
('b2000000-0000-0000-0000-000000000008', 'Pan-seared snapper', 'main', 210, null),
('b2000000-0000-0000-0000-000000000008', 'Sunset mocktail flight', 'drink', 95, null),
('b2000000-0000-0000-0000-000000000008', 'Chocolate fondant', 'dessert', 88, null),
-- Auntie Efua's
('b2000000-0000-0000-0000-000000000009', 'Waakye special (full fixings)', 'main', 55, null),
('b2000000-0000-0000-0000-000000000009', 'Waakye classic', 'main', 38, null),
('b2000000-0000-0000-0000-000000000009', 'Boiled egg + wele add-on', 'other', 15, null),
('b2000000-0000-0000-0000-000000000009', 'Chilled sobolo bottle', 'drink', 15, null),
-- Tilapia Republic
('b2000000-0000-0000-0000-000000000010', 'Whole grilled tilapia & banku', 'main', 88, 'Pick your pepper heat'),
('b2000000-0000-0000-0000-000000000010', 'Half tilapia & kenkey', 'main', 60, null),
('b2000000-0000-0000-0000-000000000010', 'Grilled yam & pepper sauce', 'starter', 35, null),
('b2000000-0000-0000-0000-000000000010', 'Bissap (large)', 'drink', 20, null),
-- Vine & Stone
('b2000000-0000-0000-0000-000000000011', 'Tagliatelle al ragù', 'main', 175, null),
('b2000000-0000-0000-0000-000000000011', 'Margherita (wood-fired)', 'main', 150, null),
('b2000000-0000-0000-0000-000000000011', 'Burrata & roasted peppers', 'starter', 120, null),
('b2000000-0000-0000-0000-000000000011', 'Tiramisu for two', 'dessert', 95, null),
('b2000000-0000-0000-0000-000000000011', 'Virgin bellini', 'drink', 55, null),
-- Highlife House
('b2000000-0000-0000-0000-000000000012', 'Toffee-plantain waffle', 'dessert', 68, null),
('b2000000-0000-0000-0000-000000000012', 'Sobolo spritz', 'drink', 43, null),
('b2000000-0000-0000-0000-000000000012', 'Spiced hot cocoa', 'drink', 42, null),
('b2000000-0000-0000-0000-000000000012', 'Shito popcorn (bottomless)', 'other', 30, null),
-- Asa Rooftop
('b2000000-0000-0000-0000-000000000013', 'Hibiscus mocktail', 'drink', 55, null),
('b2000000-0000-0000-0000-000000000013', 'Citrus spritz', 'drink', 58, null),
('b2000000-0000-0000-0000-000000000013', 'Truffle fries', 'other', 65, null),
('b2000000-0000-0000-0000-000000000013', 'Dark chocolate board', 'dessert', 80, null),
-- Palm Lane Arcade
('b2000000-0000-0000-0000-000000000014', 'Game credits (per person)', 'other', 80, '~1 hour of play'),
('b2000000-0000-0000-0000-000000000014', 'Mini bowling lane (30 min)', 'other', 90, 'Per lane'),
('b2000000-0000-0000-0000-000000000014', 'Slushie', 'drink', 25, null),
-- Legon Botanical
('b2000000-0000-0000-0000-000000000015', 'Canopy walk entry (per person)', 'other', 45, null),
('b2000000-0000-0000-0000-000000000015', 'Garden entry (per person)', 'other', 15, null),
('b2000000-0000-0000-0000-000000000015', 'Kayak rental (30 min)', 'other', 50, 'Per boat'),
-- Labadi Shore Rides
('b2000000-0000-0000-0000-000000000016', 'Horse ride (per person, 20 min)', 'other', 60, 'Negotiable on the beach'),
('b2000000-0000-0000-0000-000000000016', 'Beach entry (per person)', 'other', 20, null),
('b2000000-0000-0000-0000-000000000016', 'Fresh coconut', 'drink', 15, null),
-- Sip & Stroke
('b2000000-0000-0000-0000-000000000017', 'Guided session (per person)', 'other', 140, 'Canvas & paints included'),
('b2000000-0000-0000-0000-000000000017', 'Mocktail add-on', 'drink', 35, null),
-- Strike Zone
('b2000000-0000-0000-0000-000000000018', 'Lane hire (1 hr, up to 4)', 'other', 180, null),
('b2000000-0000-0000-0000-000000000018', 'Shoe rental (per person)', 'other', 20, null),
('b2000000-0000-0000-0000-000000000018', 'Milkshake', 'drink', 45, null),
-- Regatta Paddle
('b2000000-0000-0000-0000-000000000019', 'Tandem kayak (45 min)', 'other', 120, 'Per boat, life vests included'),
('b2000000-0000-0000-0000-000000000019', 'Pedal boat (30 min)', 'other', 90, 'Per boat'),
('b2000000-0000-0000-0000-000000000019', 'Chilled bissap', 'drink', 18, null),
-- Court One
('b2000000-0000-0000-0000-000000000020', 'Padel court (1 hr) + rackets', 'other', 200, 'Per court'),
('b2000000-0000-0000-0000-000000000020', 'Tennis court (1 hr)', 'other', 150, 'Per court'),
('b2000000-0000-0000-0000-000000000020', 'Courtside smoothie', 'drink', 40, null),
-- Lantern Garden
('b2000000-0000-0000-0000-000000000021', 'Coconut cake', 'dessert', 46, null),
('b2000000-0000-0000-0000-000000000021', 'Spiced cocoa', 'drink', 42, null),
('b2000000-0000-0000-0000-000000000021', 'Sobolo (glass)', 'drink', 25, null),
('b2000000-0000-0000-0000-000000000021', 'Waakye special (weekends)', 'main', 72, null),
('b2000000-0000-0000-0000-000000000021', 'Kelewele bowl', 'starter', 30, null),
-- Scoop Culture
('b2000000-0000-0000-0000-000000000022', 'Double scoop', 'dessert', 45, null),
('b2000000-0000-0000-0000-000000000022', 'Sobolo sorbet float', 'dessert', 55, null),
('b2000000-0000-0000-0000-000000000022', 'Affogato', 'dessert', 50, null),
-- Bloom & Bean
('b2000000-0000-0000-0000-000000000023', 'Flat white (single origin)', 'drink', 38, null),
('b2000000-0000-0000-0000-000000000023', 'Iced hibiscus latte', 'drink', 44, null),
('b2000000-0000-0000-0000-000000000023', 'Plantain bread slice', 'dessert', 32, null),
('b2000000-0000-0000-0000-000000000023', 'Chicken pesto panini', 'main', 78, null),
-- Chill Factory
('b2000000-0000-0000-0000-000000000024', 'FroYo cup (by weight, avg)', 'dessert', 50, null),
('b2000000-0000-0000-0000-000000000024', 'Toppings loadout', 'other', 20, null),
-- Kukua's Bakehouse
('b2000000-0000-0000-0000-000000000025', 'Bofrot sliders (3)', 'dessert', 40, null),
('b2000000-0000-0000-0000-000000000025', 'Meat pie', 'other', 25, null),
('b2000000-0000-0000-0000-000000000025', 'Cinnamon roll', 'dessert', 35, 'Sundays only'),
('b2000000-0000-0000-0000-000000000025', 'Iced milo', 'drink', 28, null);

-- ── Events (relative dates so demos always have something on) ────────────
insert into public.events (title, venue_id, area_id, event_date, start_time, cost_ghs, category, source_url) values
('Highlife Vinyl Night', 'b2000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000002',
 current_date + 7, '19:00', 60, 'live_music', 'https://instagram.com/highlifehouse'),
('Sip & Paint: Sunset Edition', 'b2000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000001',
 current_date + 3, '18:00', 150, 'sip_and_paint', 'https://instagram.com/sipandstrokegh'),
('Accra Street Food Festival (pop-up)', null, 'a1000000-0000-0000-0000-000000000003',
 current_date + 14, '12:00', 50, 'festival', null),
('Shoreline Run Club & Smoothies', null, 'a1000000-0000-0000-0000-000000000002',
 current_date + 5, '06:30', 0, 'run_club', null),
('Open-Air Cinema Under the Stars', null, 'a1000000-0000-0000-0000-000000000004',
 current_date + 10, '19:30', 80, 'film_night', null);
