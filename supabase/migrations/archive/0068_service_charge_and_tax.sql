-- What a venue adds to the bill: a service charge, and tax when the menu's
-- prices leave it out.
--
-- A plan said "fits your budget" from menu prices alone, and a place that adds
-- 10% service and 20% in VAT and levies on top turned a GHS 900 evening into
-- one nearer GHS 1,200 at the till. These are printed on most menus ("prices
-- are subject to 10% service charge and applicable taxes"), so they are facts
-- we can record rather than guess.
--
-- ── how they are read ───────────────────────────────────────────────────
-- Null is "nobody has recorded one", which adds nothing, exactly as before.
-- Zero is a recorded "none". Service is charged on what was ordered, and tax
-- on what was ordered plus the service, the way a bill in Accra is written.
-- Neither applies to a cover charge at the door. See chargesOn in budget.ts.

alter table public.venues
  add column if not exists service_charge_pct numeric(5,2)
  check (service_charge_pct is null or (service_charge_pct >= 0 and service_charge_pct <= 30));

alter table public.venues
  add column if not exists tax_added_pct numeric(5,2)
  check (tax_added_pct is null or (tax_added_pct >= 0 and tax_added_pct <= 40));

alter table public.venues
  add column if not exists charges_note text
  check (charges_note is null or length(charges_note) <= 200);

comment on column public.venues.service_charge_pct is
  'Service charge added to the bill, in percent. Null is not recorded, 0 is recorded as none.';
comment on column public.venues.tax_added_pct is
  'Tax added on top of menu prices, in percent: set only when the menu says prices exclude VAT and levies. Null is not recorded, 0 is prices include tax.';
comment on column public.venues.charges_note is
  'What the menu or venue says about charges, in its own words: "Prices subject to 10% service charge and applicable taxes".';

-- Venues are read through an explicit column grant (see 0014), so a new
-- column is invisible to the app, and to the planner, until it is granted.
grant select (service_charge_pct, tax_added_pct, charges_note) on public.venues to anon;
grant select (service_charge_pct, tax_added_pct, charges_note) on public.venues to authenticated;
