-- Where a venue's price came from.
--
-- Until now a price was a price: a number in avg_cost_per_person_ghs, summed
-- into a total presented as exact. That is true when it was read off a menu
-- and false when somebody guessed, and the schema could not tell the two
-- apart, so the only safe thing to do with a guess was refuse it. That is why
-- 35 venues sit unplannable: not because nothing is known about what they
-- cost, but because what is known is approximate and there was nowhere to put
-- an approximation.
--
-- price_source gives it somewhere. A plan built only from menu-priced venues
-- still promises an exact total. One that leans on an estimate says so, and
-- shows a range instead of a number nobody should trust to the cedi.

alter table public.venues
  add column if not exists price_source text not null default 'menu';

alter table public.venues
  drop constraint if exists venues_price_source_known;

alter table public.venues
  add constraint venues_price_source_known
  check (price_source in ('menu', 'estimated', 'unknown'));

comment on column public.venues.price_source is
  'menu: read off a real menu or a stated rate, exact. estimated: a band, shown as a range and never as a precise figure. unknown: no idea, withheld from planning.';

-- How wide the estimate is, as a percentage either side of the figure.
-- Stored per venue because a bucket derived from one comparable venue
-- deserves less confidence than one derived from a dozen.
alter table public.venues
  add column if not exists price_spread numeric(4,2) not null default 0.30;

alter table public.venues
  drop constraint if exists venues_price_spread_sane;

alter table public.venues
  add constraint venues_price_spread_sane
  check (price_spread >= 0 and price_spread <= 1);

comment on column public.venues.price_spread is
  'Half-width of an estimated price, as a fraction. 0.30 means the real figure is expected within 30 percent either side. Ignored when price_source is menu.';

/*
 * Anything already carrying a real figure keeps calling it a menu price,
 * because that is what it is: those numbers were read off menus or stated
 * rates. Anything with no figure and no menu rows is unknown rather than
 * estimated, since nobody has estimated it yet.
 */
update public.venues v
set price_source = 'unknown'
where not v.is_free
  and coalesce(v.avg_cost_per_person_ghs, 0) <= 0
  and coalesce(v.unit_price_ghs, 0) <= 0
  and not exists (select 1 from public.menu_items m where m.venue_id = v.id);
