-- Price lists for places that sell activities rather than food.
--
-- Three real price lists drove this, and none of them fit what was here:
-- Game It Up at Atomic Junction, Bliss Family Entertainment at Airport, and
-- Cypher Zone at Palace Mall Labone.
--
-- Four things the catalogue could not say about them:
--
-- 1. How many people one price covers. Game It Up sells a basketball machine
--    at GHS 10 for one player and a foosball table at GHS 30 for two. Charging
--    both per head bills a couple GHS 60 for the foosball, which is double.
--    This is the same class of error as the padel court in 0008, one level
--    down: there the venue charged per hour, here a single line item covers a
--    number of people.
--
-- 2. Who is allowed to play. Cypher Zone laser tag needs a minimum of six
--    players and takes twenty four. A couple cannot do it at all, so offering
--    it on a date is offering something that will be refused at the desk. Mini
--    golf there takes four, bowling six. That is per activity, not per venue,
--    so venues.min_party_size cannot express it.
--
-- 3. How long it takes. Laser tag is twelve minutes. Bowling is ten rounds.
--    The planner allots time by venue type, so it was giving a twelve minute
--    game the same ninety minutes it gives a restaurant.
--
-- 4. The least you can spend. Bliss sells arcade play only in bags of ten
--    tokens at GHS 100. The individual games are GHS 10 to 50, so a median of
--    the price list says a visit costs GHS 30, and you cannot spend GHS 30
--    there. That is the floor, and it belongs on the venue.
--
-- Run 0019 in its own statement batch, separately from 0020. Postgres will not
-- allow a new enum value to be used in the same transaction that added it, so
-- pasting this and the seed together fails on "unsafe use of new value".

-- ── The category ────────────────────────────────────────────────────────
-- An arcade game is not a starter, a main, a dessert or a drink, and filing it
-- under "other" collides with the bucket the planner already uses for entry
-- fees.
alter type menu_category add value if not exists 'activity';

-- ── What one line on the price list means ───────────────────────────────
alter table menu_items
  add column if not exists covers_people smallint not null default 1,
  add column if not exists min_players smallint,
  add column if not exists max_players smallint,
  add column if not exists duration_minutes smallint,
  add column if not exists min_age smallint,
  add column if not exists requires_gear text;

comment on column menu_items.covers_people is
  'How many people one purchase covers. 1 for a plate of food or a single-player game; 2 for a foosball table sold as a table rather than per head. The planner buys ceil(party / covers_people) of these, so getting it wrong bills a couple twice.';
comment on column menu_items.min_players is
  'Fewest people the venue will run it for. Cypher Zone laser tag is 6. Null means no minimum. A party below this is not offered the item at all, because the answer at the desk is no.';
comment on column menu_items.max_players is
  'Most people it takes in one go. Null means no practical limit.';
comment on column menu_items.duration_minutes is
  'How long it actually takes, when the venue states it. Null means fall back to the slot length for the venue type.';
comment on column menu_items.min_age is
  'Minimum age the venue enforces. Kept because it is printed on the poster and someone planning a family outing needs it.';
comment on column menu_items.requires_gear is
  'What you must bring or hire, verbatim. Cypher Zone bowling wants socks and bowling shoes. Being turned away at the counter is a worse outcome than being told in advance.';

alter table menu_items drop constraint if exists menu_items_covers_people_sane;
alter table menu_items
  add constraint menu_items_covers_people_sane check (covers_people between 1 and 50);

-- A maximum below the minimum describes an activity nobody can ever book.
alter table menu_items drop constraint if exists menu_items_player_range_sane;
alter table menu_items
  add constraint menu_items_player_range_sane check (
    min_players is null or max_players is null or max_players >= min_players
  );

-- ── The floor on a visit ────────────────────────────────────────────────
alter table venues
  add column if not exists minimum_spend_ghs numeric(10,2);

comment on column venues.minimum_spend_ghs is
  'The least one person can spend and actually do anything here. Bliss sells arcade play only as a GHS 100 bag of ten tokens, so a median of its GHS 10 to 50 games is a figure nobody can pay. Null where any single item can be bought on its own.';

alter table venues drop constraint if exists venues_minimum_spend_sane;
alter table venues
  add constraint venues_minimum_spend_sane check (
    minimum_spend_ghs is null or minimum_spend_ghs >= 0
  );

-- Every migration that adds a venues column has to grant it, because 0013 and
-- 0014 turned the venue grant into an explicit list. 0015 forgot, and took
-- plan generation down until 0017 put it back. Do not remove these.
grant select (minimum_spend_ghs) on public.venues to anon;
grant select (minimum_spend_ghs) on public.venues to authenticated;
