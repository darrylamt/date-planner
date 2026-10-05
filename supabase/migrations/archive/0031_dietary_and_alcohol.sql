-- What a dish is, as far as anybody has actually written it down.
--
-- Three fields, and the difference between them is how much they are allowed
-- to claim.
--
-- ── why there is no allergen column ─────────────────────────────────────
-- Everywhere else in this catalogue an unrecorded fact degrades into a mild
-- disappointment: nobody learns the opening hours. An unrecorded allergen
-- degrades into somebody in hospital, because a blank cell reads as "no
-- allergens" to the person scanning it, and groundnut is in a great deal of
-- Ghanaian cooking. Most Accra menus do not print allergen information at
-- all, so the column would be filled by inferring from dish names, which is
-- the same invention this catalogue refuses to commit about prices, applied
-- to something that can put a person in A&E.
--
-- So: no allergen booleans, and no nutrition. What is here instead is the
-- menu's own words, quoted, and one flag a person set by ringing the venue.
--
-- ── on the three states, again ──────────────────────────────────────────
-- Null means nobody knows. For is_alcoholic that is emphatically not the same
-- as safe: a plan built for somebody who does not drink may order only from
-- rows recorded false, never from rows recorded nothing. Corona and Cîroc are
-- both null after this migration, and both must stay out of that plan.

-- ── 1. Menu items ───────────────────────────────────────────────────────
alter table public.menu_items
  add column if not exists is_alcoholic boolean,
  add column if not exists dietary_note text;

comment on column public.menu_items.is_alcoholic is
  'True, false, or null for unknown. Null is not safe: a no-alcohol plan orders only from false.';

comment on column public.menu_items.dietary_note is
  'What the menu itself says about the dish, quoted verbatim: "Vegetarian", "Contains nuts". Never inferred, never a claim of our own.';

create index if not exists menu_items_non_alcoholic_idx
  on public.menu_items (venue_id)
  where is_alcoholic = false;

-- ── 2. Venues ───────────────────────────────────────────────────────────
-- Set by a person who rang the venue and asked, not by reading the menu. It
-- is the only dietary claim in this schema with a human behind it, which is
-- the only reason it is allowed to be a boolean at all.
alter table public.venues
  add column if not exists has_vegetarian_options boolean,
  add column if not exists dietary_checked_at timestamptz,
  add column if not exists dietary_source text;

comment on column public.venues.has_vegetarian_options is
  'Null until somebody has asked the venue. Not inferred from dish names, ever.';

comment on column public.venues.dietary_source is
  'Who said so and when they were asked, e.g. "phoned the manager, 12 Sep".';

/*
 * The grant, which is half of adding a venue column and the half that gets
 * forgotten. 0015 added price_source without one and took plan generation
 * down for everybody until 0017 put it back. The other half is
 * PUBLIC_VENUE_COLUMNS in src/lib/venueColumns.ts; miss that and the field is
 * simply invisible, which is the better of the two failures.
 */
grant select (has_vegetarian_options, dietary_checked_at, dietary_source)
  on public.venues to anon;
grant select (has_vegetarian_options, dietary_checked_at, dietary_source)
  on public.venues to authenticated;

-- ── 3. What is in the glass ─────────────────────────────────────────────
/*
 * Rules over the drink names, run once and read before being written down,
 * the same way 0030 handled vibe tags.
 *
 * The order of the three tests is the entire safety argument. A disclaimer
 * wins outright, because a Virgin Mojito is a mojito that is not a drink of
 * mojito. Then anything naming a spirit, a style or a brand. Only then the
 * plainly soft words. Run the last two the other way round and a Chocolate
 * Martini is filed as a soft drink, since "chocolate" is on the soft list,
 * and the person that lands on is the one who asked not to drink.
 *
 * Measured against the live catalogue before writing this: of 2,189 drinks,
 * 1,047 read as alcoholic, 398 as not, and 744 as neither. The 744 stay null.
 * Corona, Monkey 47, Olmeca and Cîroc are all in there, which is exactly why
 * null may never be treated as safe: the misses are real drinks.
 */
update public.menu_items set is_alcoholic = case
  when name ~* '\y(virgin|mocktail|non[- ]?alcoholic|alcohol[- ]?free|zero proof)\y'
    then false
  when name ~* '\y(beer|lager|stout|guinness|heineken|desperados|savanna|hunters|stella|smirnoff|wine|champagne|prosecco|moet|chandon|sangria|cocktail|mojito|margarita|daiquiri|martini|negroni|cosmopolitan|colada|long island|gin|vodka|whisky|whiskey|bourbon|scotch|rum|tequila|brandy|cognac|liqueur|schnapps|hennessy|martell|glenfiddich|jameson|chivas|johnnie walker|johnny walker|jack daniel|absolut|ciroc|bacardi|baileys|amarula|aperol|campari|spritz|shot|shots|cider|akpeteshie|vermouth|cointreau|kahlua|malibu|jagermeister|jagermaister|glenlivet|macallan|remy martin|belvedere|grey goose|captain morgan|hibiki|suntory|zacapa|havana club|sambuca|old fashioned|fashioned|amaretto|drambuie|grand marnier|tanqueray|bombay|gordon|beefeater|hendrick|don julio|patron|jose cuervo|casamigos|moscato|merlot|cabernet|sauvignon|chardonnay|pinot|shiraz|malbec|chianti|rioja|cava|courvoisier|tia maria|southern comfort|bulleit|talisker|lagavulin|ardbeg|balvenie|dalmore|monkey shoulder|four roses|makers mark|batida|corona|budweiser|castle|mimosa|mai tai|olmeca|monkey 47|bellini|kir royal|pornstar|dark and stormy|moscow mule|pisco|soju|sake|palm wine)\y'
    then true
  when name ~* '\y(juice|tea|coffee|espresso|cappuccino|latte|macchiato|americano|mocha|cortado|doppio|flat white|affogato|frappuccino|frappe|matcha|chocolate|milo|water|panna|soda|coke|cola|fanta|sprite|malta|milkshake|shake|smoothie|lemonade|bissap|sobolo|boba|yoghurt|yogurt|kombucha|mineral|red bull|energy drink)\y'
    then false
  else null
end
where category = 'drink';

/*
 * Food is not a drink, with the handful of exceptions that name the bottle
 * they were cooked in. Filed false rather than null so a no-alcohol plan can
 * still order dinner: leaving every plate unknown would make the preference
 * unusable for the thing people mostly do at these venues.
 */
update public.menu_items set is_alcoholic =
  case
    when name ~* '\y(rum|wine|whisky|whiskey|beer|brandy|liqueur|baileys|amarula|tiramisu)\y'
      then true
    else false
  end
where category <> 'drink';
