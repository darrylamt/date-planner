# Prompt: menu photos or PDF into an import CSV

Paste everything below the line into the AI, fill in the venue name, and attach
the menu photos or PDF. Upload the CSV it returns at Admin > Import > Menu items.

---

You are turning a venue's menu into a CSV that will be imported into Duro, an app that plans outings in Accra from real menus and real prices. The planner builds orders straight from these rows, so a wrong category or a guessed price ends up in somebody's plan. Accuracy matters more than completeness.

VENUE NAME: [paste the venue's name exactly as it appears in Duro admin]

I have attached the menu as photos or a PDF. Read every page.

## What to return

1. One CSV inside a single code block. The first line must be exactly this header:

```
venue,name,category,price_ghs,notes,days,from,to,alcoholic,dietary,covers_people,min_players,max_players,duration_minutes,min_age,requires_gear
```

2. After the code block, a short plain-text report (see "Report" at the end).

## The columns

- **venue**: the venue name exactly as I gave it, on every row.
- **name**: the item as printed, tidied: normal capitals, no prices, no item codes, no emojis. Keep brand names (Club, Guinness, Hennessy). Sizes and kids' markers go in brackets at the end, "Jollof Rice (Large)", "Chicken Nuggets (Kids)". Nothing else goes in brackets; descriptions go in notes.
- **category**: exactly one of `starter`, `main`, `dessert`, `drink`, `activity`, `other`.
  - `main`: a meal on its own. Jollof with chicken, banku and tilapia, pizza, burger, pasta, grilled fish, and stews and soups.
  - `starter`: small plates to begin with. Wings, spring rolls, samosas, soup served as a starter, salads listed as starters.
  - `dessert`: cakes, ice cream, pastries, sweet waffles and crepes.
  - `drink`: every drink. Water, soft drinks, juice, smoothies, coffee, tea, beer, wine, spirits, cocktails, mocktails.
  - `activity`: something you do and pay for. A game of bowling, a round of mini golf, laser tag, arcade tokens, a paint session, a pool pass, a spa treatment.
  - `other`: plain sides and extras (plain rice, fries, yam, banku, fufu, kenkey, plantain, extra chicken), shisha, packages that are not one dish, and anything that fits nowhere else.
- **price_ghs**: the price for ONE of the item, as a number only: `85`, not `GHS 85.00` or `₵85`. A drink sold by the glass and by the bottle is two rows: "Red Wine (Glass)" and "Red Wine (Bottle)".
  - **Any wine, champagne or spirit priced for the whole bottle gets "(Bottle)" in its name, even when the menu prints only the brand.** A wine list or a spirits section with prices in the hundreds or thousands is almost always bottle prices: "Hennessy VS 1,700" is "Hennessy VS (Bottle)". A shot or glass of the same drink gets "(Shot)" or "(Glass)". Without this, plans order a bottle as one person's drink.
- **alcoholic**: `yes` or `no` for drinks, blank for food. `no` for water, soft drinks, juice, smoothies, coffee, tea, malt drinks, mocktails and anything marked virgin or non-alcoholic. `yes` for beer, wine, spirits, cider and cocktails. If you cannot tell (a house cocktail with no ingredients listed), leave it blank: blank keeps it out of alcohol-free plans, which is the safe side.
- **dietary**: only what the menu itself prints about the dish, such as `Vegan`, `Vegetarian`, `Gluten free` or a (V) symbol the menu explains as vegetarian. Never decide this from the ingredients. Leave it blank when the menu says nothing.
- **notes**: at most 150 characters, and only what the menu itself says that helps somebody choose. What the dish is ("Grilled tilapia with banku and pepper"), what comes with it ("Served with fries"), how much ("6 pieces", "Serves two"), or "Add-on, not sold on its own". Never write a description the menu does not give. Leave it blank if the menu says nothing.
- **days, from, to**: only when the menu says a price applies at certain times, such as happy hour, weekend brunch, a lunch special or off-peak rates. Write days as `Mon-Thu`, `Fri;Sat`, `weekdays` or `weekends`, and from/to in 24-hour time like `16:00`. Leave all three blank for normal prices. The same item at two prices at two times is two rows.
- **covers_people, min_players, max_players, duration_minutes, min_age, requires_gear**: for `activity` rows only. Leave them blank for food and drink.
  - `covers_people`: how many people one price covers. "Foosball GHS 30 per table, 2 players" is price 30, covers_people 2. "Per person" or "per head" is 1. A couples massage priced for two is covers_people 2.
  - `min_players`: the fewest people it can be booked for, only if the menu says ("minimum 6 players").
  - `max_players`: the most per booking, lane or table, only if stated.
  - `duration_minutes`: how long one purchase lasts, only if stated ("1 hour" is 60).
  - `min_age`: an age limit, only if stated ("18+" is 18).
  - `requires_gear`: what you must bring or rent, only if stated ("Grip socks").

## Rules the planner depends on

1. **One row per thing you can buy, at one price.** Never merge two dishes into one row, and never repeat the same item at the same price.
2. **Every row needs a printed price.** Skip anything with no price, "market price", "MP" or "ask staff", and list it in the report. Never guess a price.
3. **List every plain side.** Plain rice, jollof on its own, fried rice, yam, banku, kenkey, fufu, plantain, fries and chips are each their own row in `other`. The app pairs every stew and soup with a side from the same menu, so a menu without its sides produces plans with a stew and nothing to eat it with.
4. **Stews, soups and sauces sold without a side** (egg stew, palava sauce, light soup, groundnut soup, okro stew, fish in sauce) are `main`, named as printed. If the menu says what they come with, put it in notes: "Served with rice", or "With rice, yam or banku" when there is a free choice.
5. **A dish that includes its starch** ("Banku with tilapia", "Waakye special", "Jollof with chicken") is a `main`, and its name should say what is in it.
6. **Children's items get "(Kids)" in the name**, like "Chicken Nuggets (Kids)" or "Trampoline (Under 12s)". The app keeps these away from adult groups, and it can only do that if the name says so.
7. **Add-ons that cannot be bought alone** (extra cheese, extra token, add a shot) go in `other`, or in `activity` at an activity venue, with notes "Add-on, not sold on its own".
8. **No rows for fees.** Service charge, VAT, delivery, corkage and deposits are not items. Mention them in the report.
9. **Set menus and combos** with one price are one row at the printed price, with notes saying what is in them and how many they serve.
10. **Unreadable means skipped.** If a price or name is blurry, cut off or ambiguous, leave the row out and say so in the report. A missing row can be added later; a wrong one goes straight into plans.
11. **Cedis only.** If prices are in another currency, or look wrong (a GHS 5 steak, a GHS 2,000 soft drink), flag them in the report rather than correcting them.

## CSV format

- Comma separated. Wrap any field that contains a comma in double quotes, and write a double quote inside a field as two double quotes.
- No blank lines, no section-heading rows ("STARTERS"), and no totals.

Example rows:

```
venue,name,category,price_ghs,notes,days,from,to,covers_people,min_players,max_players,duration_minutes,min_age,requires_gear
Example Grill,Palava Sauce,main,95,"Served with boiled yam or plantain",,,,,,,,,,,
Example Grill,Vegetable Curry,main,110,"With rice",,,,,Vegan,,,,,,
Example Grill,Plain Rice,other,30,,,,,,,,,,,,
Example Grill,Club Beer,drink,25,,Mon-Fri,17:00,19:00,yes,,,,,,,
Example Grill,Club Beer,drink,35,,,,,yes,,,,,,,
Example Grill,Hennessy VS (Shot),drink,90,,,,,yes,,,,,,,
Example Grill,Hennessy VS (Bottle),drink,1700,,,,,yes,,,,,,,
Example Grill,Pineapple Juice,drink,40,,,,,no,,,,,,,
Example Grill,Chicken Nuggets (Kids),main,60,"6 pieces with fries",,,,,,,,,,,
Example Arcade,Bowling,activity,125,"Per head, per game",,,,,,1,,,,,
Example Arcade,Foosball,activity,30,"Per table",,,,,,2,2,2,,,
```

## Report (after the CSV)

- Items skipped, and why.
- Anything you were unsure of: a category that could go either way, an item you split into two rows, a price that looks odd.
- Service charge, VAT or other fees printed on the menu.
- How many rows the CSV has.
