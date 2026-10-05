-- Two gaps found by importing a real menu.
--
-- ── 1. Every import after 0031 came back unclassified ───────────────────
--
-- 0031 classified is_alcoholic with a one-off UPDATE across the 2,189 drinks
-- then on file. Nothing classifies a row inserted afterwards, so every CSV
-- import, every generated migration and every hand-typed item has landed with
-- is_alcoholic null since.
--
-- Null is not merely untidy here. A plan for somebody who does not drink may
-- order only from drinks recorded false, so an unclassified drink is silently
-- withheld from them, and a menu imported today would be invisible to exactly
-- the people the field was added for.
--
-- The menu that found this is a case in point: it lists "Blue Breeze
-- (Non-Alcoholic)" at GHS 75 beside "Blue Breeze (Alcoholic +Rum)" at 100.
-- The names say plainly which is which and nothing was reading them.
--
-- So the rule moves from a migration into a trigger, where it runs for every
-- writer rather than once. It fires only when is_alcoholic is null, so a
-- person who has said otherwise is never overruled: setting it by hand is
-- still the last word.
--
-- The order of the three tests is the same safety argument as in 0031. A
-- disclaimer wins outright, because a Virgin Mojito is a mojito that is not a
-- drink of mojito. Then anything naming a spirit, a style or a brand. Only
-- then the plainly soft words. Run the last two the other way round and a
-- Chocolate Martini is filed as a soft drink.

create or replace function public.classify_menu_alcohol()
returns trigger
language plpgsql
as $$
begin
  -- Somebody has already decided. Leave it alone.
  if new.is_alcoholic is not null then
    return new;
  end if;

  if new.category <> 'drink' then
    new.is_alcoholic := new.name ~* '\y(rum|wine|whisky|whiskey|beer|brandy|liqueur|baileys|amarula|tiramisu)\y';
    return new;
  end if;

  if new.name ~* '\y(virgin|mocktail|non[- ]?alcoholic|alcohol[- ]?free|zero proof)\y' then
    new.is_alcoholic := false;
  elsif new.name ~* '\y(beer|lager|stout|guinness|heineken|desperados|savanna|hunters|stella|smirnoff|wine|champagne|prosecco|moet|chandon|sangria|cocktail|mojito|margarita|daiquiri|martini|negroni|cosmopolitan|colada|long island|gin|vodka|whisky|whiskey|bourbon|scotch|rum|tequila|brandy|cognac|liqueur|schnapps|hennessy|martell|glenfiddich|jameson|chivas|johnnie walker|johnny walker|jack daniel|absolut|ciroc|bacardi|baileys|amarula|aperol|campari|spritz|shot|shots|cider|akpeteshie|vermouth|cointreau|kahlua|malibu|jagermeister|jagermaister|glenlivet|macallan|remy martin|belvedere|grey goose|captain morgan|hibiki|suntory|zacapa|havana club|sambuca|old fashioned|fashioned|amaretto|drambuie|grand marnier|tanqueray|bombay|gordon|beefeater|hendrick|don julio|patron|jose cuervo|casamigos|moscato|merlot|cabernet|sauvignon|chardonnay|pinot|shiraz|malbec|chianti|rioja|cava|courvoisier|tia maria|southern comfort|bulleit|talisker|lagavulin|ardbeg|balvenie|dalmore|monkey shoulder|four roses|makers mark|batida|corona|budweiser|castle|mimosa|mai tai|olmeca|monkey 47|bellini|kir royal|pornstar|dark and stormy|moscow mule|pisco|soju|sake|palm wine)\y' then
    new.is_alcoholic := true;
  elsif new.name ~* '\y(juice|tea|coffee|espresso|cappuccino|latte|macchiato|americano|mocha|cortado|doppio|flat white|affogato|frappuccino|frappe|matcha|chocolate|milo|water|panna|soda|coke|cola|fanta|sprite|malta|milkshake|shake|smoothie|lemonade|bissap|sobolo|boba|yoghurt|yogurt|kombucha|mineral|red bull|energy drink)\y' then
    new.is_alcoholic := false;
  end if;
  -- Anything else stays null, which is not "safe" and is never offered to
  -- somebody who asked for no alcohol.

  return new;
end;
$$;

drop trigger if exists menu_items_classify_alcohol on public.menu_items;

create trigger menu_items_classify_alcohol
  before insert or update of name, category on public.menu_items
  for each row execute function public.classify_menu_alcohol();

-- PostgREST exposes every function in public as an RPC, and a trigger
-- function reachable that way is one anybody can call. Same fix as 0012.
revoke execute on function public.classify_menu_alcohol() from public;
revoke execute on function public.classify_menu_alcohol() from anon, authenticated;

-- ── 2. Italian, Korean and Jamaican were all "continental" ──────────────
--
-- venues.cuisine has three values: local, continental, both. That is exactly
-- the distinction the planner needs, because Accra eats two ways and a chop
-- bar and a Mediterranean place are both type "restaurant". It is useless for
-- somebody asking for Korean food: Italian, Korean, Jamaican, Lebanese and
-- Japanese all collapse into the same bucket, and the catalogue has no way to
-- tell them apart or to admit that it cannot.
--
-- So a second, finer field rather than a replacement. cuisine keeps its
-- three-valued job in the planner, untouched; cuisines says what kitchen it
-- actually is, and an empty array means nobody has recorded one, which is not
-- the same as the food being from nowhere.
--
-- An array rather than one value, because a place can honestly be two things,
-- and text rather than an enum, because Accra will grow a kitchen this list
-- has not thought of and that should not need a migration to write down. The
-- vocabulary lives beside the vibe tags in catalog.ts, for the reason 0030
-- exists: a word the data uses and the search does not is a word that matches
-- nothing.
alter table public.venues
  add column if not exists cuisines text[] not null default '{}';

comment on column public.venues.cuisines is
  'Specific kitchens: italian, korean, jamaican, lebanese. Empty means nobody has recorded one, never that the food is from nowhere. Separate from cuisine, which stays local/continental/both for the planner.';

create index if not exists venues_cuisines_idx on public.venues using gin (cuisines);

-- Both halves of adding a venue column. 0015 added price_source without the
-- grant and took plan generation down until 0017 put it back.
grant select (cuisines) on public.venues to anon;
grant select (cuisines) on public.venues to authenticated;
