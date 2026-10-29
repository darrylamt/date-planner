# Prompt: menu photos or PDF into an import CSV

Paste everything below the line into the AI, fill in the venue name, and attach
the menu photos or PDF. Paste the CSV it returns at Admin > Import > Menu items,
check the preview, then import. Rows that carry role and time are planned
straight away. Rows without them are read by Gemini overnight. Updated 29 Oct
2026 with the dish labels (0096), bottle and size rules, and delivery apps.

---

You are turning a venue's menu into a CSV for Duro!, an app that plans outings in Accra, Ghana, from real menus and real prices. The planner orders straight from these rows: it picks each person a main, a drink to go with it, a side for a stew, dessert at the right stop, breakfast only in the morning, and nothing alcoholic for people who asked for none. A wrong label or a guessed price ends up in somebody's plan. Accuracy matters more than completeness.

VENUE NAME: [paste the venue's name exactly as it appears in Duro admin]

I have attached the menu as photos or a PDF. Read every page.

## First: is this the venue's own menu?

If it is a screenshot of a delivery app (Bolt Food, Glovo, Jumia Food or similar), do not convert it. Delivery apps charge more than the venue, so we never use their prices as menu rows. Reply only: "This is a delivery-app menu, not converted."

## What to return

1. One CSV inside a single code block. The first line must be exactly this header:

```
venue,name,category,price_ghs,notes,role,time,type,drink,tags,alcoholic,dietary,covers_people,days,from,to,min_players,max_players,duration_minutes,min_age,requires_gear
```

2. After the code block, a short plain-text report (see "Report" at the end).

## The columns

- **venue**: the venue name exactly as I gave it, on every row.
- **name**: the item's own name, tidied: normal capitals, no prices, no item codes, no emojis. Keep the menu's spelling and brand names (Club, Guinness, Hennessy); fix only obvious typos. Never add the section heading: "Pesto Brioche", not "Brunch - Pesto Brioche". Brackets at the end only for these: a size, "(Small)" or "(Large)"; "(Kids)"; and "(Glass)", "(Shot)" or "(Bottle)" for drinks. Descriptions go in notes.
- **category**: exactly one of `starter`, `main`, `dessert`, `drink`, `activity`, `other`.
  - `main`: a complete dish somebody orders as their meal. Jollof with chicken, banku and tilapia, waakye, pizza, burger, pasta, grilled fish, set meals. Breakfast and brunch dishes too: omelettes, pancakes, waffles, French toast, granola, an English breakfast. Ghanaian soups and stews sold as a meal (light soup, groundnut soup, palava sauce, okro stew, egg stew) are `main`.
  - `starter`: a real first course or a sharing plate. Wings, spring rolls, samosas, calamari, a starter soup (cream of mushroom), salads listed as starters.
  - `dessert`: something sweet after a meal. Cakes, ice cream, sweet crêpes, brownies. Never breakfast dishes.
  - `drink`: anything to drink.
  - `activity`: games, courts, sessions, passes and classes. Bowling, laser tag, arcade tokens, a paint session, a pool pass, a spa treatment.
  - `other`: plain sides, add-ons, sauces, extras and shisha. Never file a side or an add-on as a starter or a main.
- **price_ghs**: the price for ONE of the item, in Ghana cedis, as a number only: `85`, not `GHS 85.00` or `₵85`.
- **notes**: short and plain, only what the menu itself says. What a dish or set includes, separated with " / ": "Jollof / quarter chicken / coleslaw". How much: "6 pieces", "Serves two". What comes with it: "Served with rice" or "With fufu or rice". Never use commas in notes; use " / ". Add these markers where they apply:
  - "Side" for sides;
  - "Add-on" for add-ons;
  - "Kids menu" for children's items;
  - "Mocktail" at the start for mocktails;
  - "Glass" or "Bottle" for wine;
  - "Single shot" for spirits by the glass.
  Never invent a description the menu does not give.
- **role**: what it is on a table. One of:
  - `main`: a full plate somebody makes a meal of.
  - `light`: a light plate, not a full meal. A salad, a sandwich, a wrap, a small bowl, soup on its own.
  - `side`: only eaten with something else. Plain rice, chips, fries, plantain, kenkey, bread, and fufu, banku, eba or omo tuo listed without a soup or stew.
  - `starter`: a first course or a sharing plate.
  - `dessert`: something sweet after a meal.
  - `pastry`: baked goods with coffee. A croissant, a muffin, a slice of cake, a cookie, a doughnut.
  - `snack`: small bites or bar food. Nuts, popcorn, chips and dip, kebab sticks.
  - `drink`: anything to drink.
  - `addon`: an extra on something else. Extra cheese, a sauce, an extra shot, a token, a mixer.

  Judge by what the item is, not by the menu's section, which is often wrong: a salad under "Mains" is `light`, and plain rice under "Mains" is `side`. Leave role blank for `activity` rows.
- **time**: when people eat it. One of:
  - `breakfast`: eggs, omelettes, pancakes, porridge, an English breakfast, toast and similar.
  - `brunch`: plates the menu sells only at brunch.
  - `anytime`: everything else, including every drink and every dessert.

  Leave time blank for `activity` rows.
- **type**: food only, what kind of dish. One of: `soup`, `salad`, `sandwich`, `burger`, `wrap_shawarma`, `pizza`, `pasta`, `rice_dish` (jollof, fried rice, waakye), `noodles`, `swallow` (fufu, banku, kenkey, omo tuo, tuo zaafi, eba), `stew_curry`, `grill` (suya, kebab, grilled meat or fish), `steak`, `seafood_plate`, `fried_plate`, `sushi`, `platter`, `wings`, `finger_food`, `bread`, `eggs`, `breakfast_plate`, `pancakes_waffles`, `pastry`, `cake`, `ice_cream`, `dessert_other`, `kids_meal`, `side_starch` (fries, plain rice, plantain), `vegetables`, `other`. Blank for drinks, add-ons and activities.
- **drink**: drinks only, what kind. One of: `still_water`, `sparkling_water`, `soda`, `malt`, `energy_drink`, `fresh_juice`, `bottled_juice`, `smoothie`, `milkshake`, `coffee`, `iced_coffee`, `hot_tea`, `iced_tea`, `hot_chocolate`, `local_drink` (sobolo, asaana, brukina, lamugin), `mocktail`, `cocktail`, `local_beer` (Club, Star, Guinness Ghana), `imported_beer`, `craft_beer`, `cider`, `palm_wine`, `red_wine`, `white_wine`, `rose_wine`, `sparkling_wine` (prosecco, cava), `champagne`, `whisky`, `vodka`, `gin`, `rum`, `tequila`, `brandy_cognac`, `liqueur`, `shot`, `other`. Blank for food.
- **tags**: up to 6, separated with `;`, only from this list and only where they truly apply:
  - **in it**: `chicken`, `beef`, `goat`, `lamb`, `pork`, `fish`, `seafood`, `egg`, `vegetarian`, `vegan`;
  - **cooked**: `grilled`, `fried`, `baked`, `stewed`, `raw`, `spicy`;
  - **kitchen**: `ghanaian`, `west_african`, `continental`, `italian`, `chinese`, `japanese`, `indian`, `lebanese`, `american`, `french`, `mexican`, `fusion`;
  - **like**: `sharing` (meant for two or more), `kids`, `healthy`, `heavy`, `sweet`, `alcoholic`, `non_alcoholic`, `hot`, `cold`, `premium` (luxury, such as lobster, wagyu or champagne).

  These rules keep people's diets safe:
  - Always tag the meat or fish a dish contains, sausage and bacon included (`pork`).
  - Tag `vegetarian` only when the dish clearly has no meat, fish or seafood. Plain "Jollof" usually comes with chicken, so leave it untagged unless the menu says otherwise.
  - Tag `vegan` only when it clearly has no animal products at all.
  - Jollof, waakye, banku, fufu, kelewele, red red and light soup are `ghanaian`.
- **alcoholic**: `yes` or `no` on every row, food included.
  - `yes`: beer, wine, champagne, prosecco, spirits, liqueurs, cocktails, anything with alcohol in it.
  - `no`: all food, soft drinks, malt, energy drinks, juice, water, coffee, tea, smoothies, mocktails and anything marked virgin or non-alcoholic.
  - Blank: only a drink that is genuinely unclear, such as a house cocktail with no ingredients listed. Blank keeps it out of alcohol-free plans, which is the safe side. Mention it in the report.
- **dietary**: only the menu's own words, such as `Vegan`, `Vegetarian` or `Gluten free`, or a (V) symbol the menu explains. Never decide this yourself; that is what tags are for. Blank when the menu says nothing.
- **covers_people**: how many people ONE price serves. Leave it blank for 1, except on activities, where you always fill it in. Otherwise:
  - "for two" is 2;
  - a bottle of wine, prosecco or champagne is 4;
  - a bottle of spirits is 6;
  - a platter, combo or family deal is the number the menu states. If it states none, leave it blank and mention it in the report.
  - On activities: "per table, 2 players" is 2; "per person" or "per head" is 1; a couples massage priced for two is 2.
- **days, from, to**: only when the menu says a price applies at certain times: happy hour, weekend brunch, a lunch special, off-peak rates.
  - days: `Mon-Thu`, `Fri;Sat`, `Sat;Sun`, `weekdays` or `weekends`. Never a time.
  - from and to: 24-hour times like `16:00`. "From 2pm" is from `14:00` with to blank. "Until 7:30pm" is to `19:30` with from blank.
  - A section's days and hours apply to every item under it, its sides and add-ons included. Everything under "Sunday Brunch 10am-4pm" gets days `Sun`, from `10:00`, to `16:00`.
  - Leave all three blank for normal prices.
- **min_players, max_players, duration_minutes, min_age, requires_gear**: activities only, and only what the list says. For example "minimum 6 players", "up to 4 per lane", "1 hour" (60), "18+" (18), "grip socks required". Blank for food and drink.

## Rules the planner depends on

1. **Never guess a price.** Leave out anything with no readable price: "market price", "MP", "ask staff", cut off or blurred. List it in the report. A missing row can be added later; a wrong one goes straight into plans.
2. **One row per thing you can buy, at one price.** Never merge two items into one row. The same item in two sections at the same price is listed once. "Small 60 / Large 95" is two rows: "Chicken Wings (Small)" and "Chicken Wings (Large)". The same item at two prices at two times (happy hour) is two rows with the same name.
3. **Bottles say so.** Any wine, champagne or spirit priced for the whole bottle gets "(Bottle)" in its name and the covers_people above, even when the menu prints only the brand. A wine list or spirits section priced in the hundreds or thousands is almost always bottle prices: "Hennessy VS 1,700" is "Hennessy VS (Bottle)". A glass or shot of the same drink is its own row with "(Glass)" or "(Shot)". Without this, plans order a bottle as one person's drink.
4. **List every plain side.** Plain rice, fried rice, yam, banku, kenkey, fufu, plantain, fries and chips are each their own row: category `other`, role `side`. The app pairs every stew and soup with a side from the same menu, so a menu without its sides gives a stew with nothing to eat it with.
5. **A stew or soup sold without a side** is a `main`, named as printed. If the menu says what it comes with, notes say so: "Served with rice", or "With rice, yam or banku" when there is a choice.
6. **A dish that includes its starch** ("Banku with tilapia", "Waakye special", "Jollof with chicken") is a `main`, and its name says what is in it.
7. **Children's items** get "(Kids)" in the name, "Kids menu" in notes and the `kids` tag. The app keeps them away from adult tables only if they are marked.
8. **Add-ons that cannot be bought alone** (extra cheese, a sauce, an extra token, add a shot) are category `other`, role `addon`, notes "Add-on". At an activity venue they are `activity`.
9. **Breakfast is breakfast.** Eggs, omelettes, pancakes, porridge and English breakfasts get time `breakfast`, so they are never served at four in the afternoon. Brunch-only plates get `brunch`. Desserts and drinks are always `anytime`.
10. **No rows for fees.** Service charge, VAT, delivery, corkage and deposits are not items. Put them in the report, word for word.
11. **Set menus and combos** with one price are one row at the printed price, with notes saying what is in them and covers_people for how many they serve.
12. **Cedis only.** If prices are in another currency or look wrong (a GHS 5 steak, a GHS 2,000 soft drink), flag them in the report rather than correcting them.

## CSV format

- Comma separated, 21 columns on every row, blanks left empty.
- If a name contains a comma, wrap the field in double quotes. Write a double quote inside a field as two double quotes. Notes never contain commas.
- No blank lines, no section-heading rows ("STARTERS") and no totals.

Example rows:

```
venue,name,category,price_ghs,notes,role,time,type,drink,tags,alcoholic,dietary,covers_people,days,from,to,min_players,max_players,duration_minutes,min_age,requires_gear
Example Grill,Jollof Rice with Grilled Chicken,main,120,Jollof / quarter chicken / coleslaw,main,anytime,rice_dish,,chicken;grilled;ghanaian;heavy,no,,,,,,,,,,
Example Grill,Light Soup with Goat,main,110,Served with fufu or rice,main,anytime,soup,,goat;spicy;ghanaian,no,,,,,,,,,,
Example Grill,Plain Rice,other,30,Side,side,anytime,side_starch,,vegetarian,no,,,,,,,,,,
Example Grill,Vegetable Curry,main,105,With rice,main,anytime,stew_curry,,vegan;vegetarian;spicy;indian,no,Vegan,,,,,,,,,
Example Grill,Caesar Salad,starter,85,Romaine / croutons / parmesan,light,anytime,salad,,vegetarian;continental;cold,no,,,,,,,,,,
Example Grill,Chicken Wings (Small),starter,60,6 pieces,starter,anytime,wings,,chicken;fried;sharing,no,,,,,,,,,,
Example Grill,Chicken Wings (Large),starter,95,12 pieces,starter,anytime,wings,,chicken;fried;sharing,no,,,,,,,,,,
Example Grill,Full English Breakfast,main,130,Eggs / sausage / beans / toast,main,breakfast,breakfast_plate,,egg;pork;fried;continental;heavy,no,,,Sat;Sun,08:00,12:00,,,,,
Example Grill,Chicken Nuggets (Kids),main,60,Kids menu / 6 pieces with fries,main,anytime,kids_meal,,chicken;fried;kids,no,,,,,,,,,,
Example Grill,Extra Cheese,other,15,Add-on,addon,anytime,,,vegetarian,no,,,,,,,,,,
Example Grill,Chocolate Lava Cake,dessert,70,,dessert,anytime,cake,,sweet;baked;hot,no,,,,,,,,,,
Example Grill,Sobolo,drink,25,Chilled hibiscus,drink,anytime,,local_drink,ghanaian;non_alcoholic;cold,no,,,,,,,,,,
Example Grill,Virgin Mojito,drink,55,Mocktail,drink,anytime,,mocktail,non_alcoholic;cold,no,,,,,,,,,,
Example Grill,Club Beer,drink,25,Happy hour,drink,anytime,,local_beer,alcoholic;cold,yes,,,Mon-Fri,17:00,19:00,,,,,
Example Grill,Club Beer,drink,35,,drink,anytime,,local_beer,alcoholic;cold,yes,,,,,,,,,,
Example Grill,House Red Wine (Glass),drink,70,Glass,drink,anytime,,red_wine,alcoholic,yes,,,,,,,,,,
Example Grill,House Red Wine (Bottle),drink,380,Bottle,drink,anytime,,red_wine,alcoholic;sharing,yes,,4,,,,,,,,
Example Grill,Hennessy VS (Shot),drink,90,Single shot,drink,anytime,,brandy_cognac,alcoholic,yes,,,,,,,,,,
Example Grill,Hennessy VS (Bottle),drink,1700,Bottle,drink,anytime,,brandy_cognac,alcoholic;premium;sharing,yes,,6,,,,,,,,
Example Arcade,Bowling,activity,125,Per person / per game,,,,,,no,,1,,,,1,6,,,
Example Arcade,Foosball,activity,30,Per table / 30 minutes,,,,,,no,,2,,,,2,4,30,,
```

## Report (after the CSV)

- Items left out, and why.
- Anything you were unsure of: a category or role that could go either way, an item you split into rows, a price that looks odd, a drink you could not call alcoholic or not, a platter that did not say how many it serves.
- Service charge, VAT or other fees printed on the menu, word for word.
- How many rows the CSV has.
