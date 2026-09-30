-- Who can come: ladies-only (and men-only) events and weekly fixtures.
--
-- A ladies-only brunch or a women's spa day is a night the planner must not
-- send a mixed group to, and until now nothing said which nights those were.
--
-- ── not the same as a ladies' night ─────────────────────────────────────
-- A ladies' night lets everybody in and lets the women in free, or pours
-- their drinks cheaper. That is a perk, and stays "everyone" with the perk in
-- the notes. This column is only for nights where others cannot come at all.
--
-- ── how the planner reads it ────────────────────────────────────────────
-- A plan says who is going (mixed, all ladies, all guys), mixed unless told.
-- A "women" night is only planned for all ladies, a "men" night only for all
-- guys, and a venue whose ladies-only fixture overlaps the planned hours is
-- kept away from everybody else for that evening.

alter table public.events
  add column if not exists audience text not null default 'everyone'
  check (audience in ('everyone', 'women', 'men'));

comment on column public.events.audience is
  'Who can come. ''women'' and ''men'' are nights nobody else may attend, not perks: a ladies'' night with free entry for women is ''everyone''.';

alter table public.venue_schedules
  add column if not exists audience text not null default 'everyone'
  check (audience in ('everyone', 'women', 'men'));

comment on column public.venue_schedules.audience is
  'Who can come to this weekly fixture. While a ''women'' fixture is on, the planner keeps the venue away from any group that is not all ladies.';
