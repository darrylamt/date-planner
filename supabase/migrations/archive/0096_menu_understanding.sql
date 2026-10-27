-- What each dish is, read by Gemini (src/lib/menuUnderstand.ts), so the
-- planner stops guessing from names.
--
-- The owner's review of a Sunday anniversary plan (27 Oct 2026): croissants
-- and nothing to drink, an egg plate at half past three, scrambled eggs again
-- an hour later, a tea room for a glass of water. The planner read "main" off
-- the menu's own category and could not tell a full plate from a side, a
-- pastry from dinner, or breakfast from anything else. Three answers per dish:
--
--   dish_role  main      a full plate somebody makes a meal of
--              light     a light plate: a salad, a sandwich, a small bowl
--              side      rice, chips, plantain: with something, never alone
--              starter   a first course or a sharing plate
--              dessert   something sweet after
--              pastry    croissants, muffins, cakes by the slice: with coffee
--              snack     small bites, bar food
--              drink     anything to drink
--              addon     extras: a sauce, extra cheese, a token
--   meal_time  breakfast | brunch | anytime   when people eat it
--   dish_type  food only, finer: soup, salad, sandwich, burger, wrap_shawarma,
--              pizza, pasta, rice_dish (jollof, waakye), noodles, swallow (fufu,
--              banku, kenkey, omo tuo), stew_curry, grill (suya, kebab), steak,
--              seafood_plate, fried_plate, sushi, platter, wings, finger_food,
--              bread, eggs, breakfast_plate, pancakes_waffles, pastry, cake,
--              ice_cream, dessert_other, kids_meal, side_starch, vegetables
--   drink_kind drinks only: still_water, sparkling_water, soda, malt,
--              energy_drink, fresh_juice, bottled_juice, smoothie, milkshake,
--              coffee, iced_coffee, hot_tea, iced_tea, hot_chocolate,
--              local_drink (sobolo, asaana, brukina), mocktail, cocktail,
--              local_beer, imported_beer, craft_beer, cider, palm_wine,
--              red_wine, white_wine, rose_wine, sparkling_wine, champagne,
--              whisky, vodka, gin, rum, tequila, brandy_cognac, liqueur, shot
--
--   dish_tags  a few words from a fixed list: what is in it (chicken, beef,
--              goat, lamb, pork, fish, seafood, egg, vegetarian, vegan), how it
--              is cooked (grilled, fried, baked, stewed, raw, spicy), its kitchen
--              (ghanaian, west_african, continental, italian, chinese, japanese,
--              indian, lebanese, american, french, mexican, fusion), and what
--              it is like (sharing, kids, healthy, heavy, sweet, alcoholic,
--              non_alcoholic, hot, cold, premium). The planner uses them for
--              variety between stops and for a person's taste (taste.ts).
--
-- understood_hash is a hash of what Gemini was shown (name, notes,
-- category), so an edited dish is read again and an unchanged one is not.
-- Null everywhere until a dish has been read; the planner falls back to its
-- old rules for those.

alter table public.menu_items
  add column if not exists dish_role text
    check (dish_role is null or dish_role in ('main', 'light', 'side', 'starter', 'dessert', 'pastry', 'snack', 'drink', 'addon')),
  add column if not exists meal_time text
    check (meal_time is null or meal_time in ('breakfast', 'brunch', 'anytime')),
  add column if not exists dish_type text
    check (dish_type is null or dish_type in ('soup', 'salad', 'sandwich', 'burger', 'wrap_shawarma', 'pizza', 'pasta', 'rice_dish', 'noodles', 'swallow', 'stew_curry', 'grill', 'steak', 'seafood_plate', 'fried_plate', 'sushi', 'platter', 'wings', 'finger_food', 'bread', 'eggs', 'breakfast_plate', 'pancakes_waffles', 'pastry', 'cake', 'ice_cream', 'dessert_other', 'kids_meal', 'side_starch', 'vegetables', 'other')),
  add column if not exists drink_kind text
    check (drink_kind is null or drink_kind in ('still_water', 'sparkling_water', 'soda', 'malt', 'energy_drink', 'fresh_juice', 'bottled_juice', 'smoothie', 'milkshake', 'coffee', 'iced_coffee', 'hot_tea', 'iced_tea', 'hot_chocolate', 'local_drink', 'mocktail', 'cocktail', 'local_beer', 'imported_beer', 'craft_beer', 'cider', 'palm_wine', 'red_wine', 'white_wine', 'rose_wine', 'sparkling_wine', 'champagne', 'whisky', 'vodka', 'gin', 'rum', 'tequila', 'brandy_cognac', 'liqueur', 'shot', 'other')),
  add column if not exists dish_tags text[],
  add column if not exists understood_hash text,
  add column if not exists understood_at timestamptz;

create index if not exists menu_items_not_understood on public.menu_items (id) where understood_hash is null;
