-- How a venue charges, not just how much.
--
-- Everything so far assumed per-person pricing, because menus work that way:
-- four people means four mains. A padel court does not. The court is GHS X an
-- hour whoever turns up, so four players split one bill and two players split
-- the same bill — the cost per head halves as the group grows, which is the
-- opposite of how the planner has been computing every total.
--
-- Bowling lanes, escape rooms and karaoke booths all charge like this. Without
-- a mode, the only way to store a court was a per-person figure that is wrong
-- for every party size except the one it was written for.

alter table venues
  add column if not exists pricing_mode text not null default 'per_person',
  add column if not exists unit_price_ghs numeric(10,2);

comment on column venues.pricing_mode is
  'per_person: each person pays (menus, covers). per_group: one flat charge split by the group. per_hour: one charge per hour, split by the group (a padel court, a bowling lane). per_hour_per_person: each person pays per hour.';
comment on column venues.unit_price_ghs is
  'The charge that pricing_mode refers to: per person, per group, or per hour. Null when the venue is priced from its menu instead.';

alter table venues
  drop constraint if exists venues_pricing_mode_known;

alter table venues
  add constraint venues_pricing_mode_known
  check (pricing_mode in ('per_person', 'per_group', 'per_hour', 'per_hour_per_person'));

-- A non-default mode with no price is a venue nobody can cost, which is worse
-- than one plainly marked unpriced: it looks configured and is not.
alter table venues
  drop constraint if exists venues_unit_price_present;

alter table venues
  add constraint venues_unit_price_present
  check (
    pricing_mode = 'per_person'
    or is_free
    or unit_price_ghs is not null
  );
