-- A "social" staff role (owner, 15 Nov 2026): the person who runs Duro!'s
-- Instagram and WhatsApp Channel. They sign in at /staff/login like the other
-- staff and see Admin → Social only: the weekend post, lineups, and the Flyer
-- maker. They read the catalogue through the server and write nothing, so the
-- role needs no policies of its own; this only lets the role exist.
alter table public.staff_roles drop constraint if exists staff_roles_role_check;
alter table public.staff_roles add constraint staff_roles_role_check
  check (role in ('photos', 'menus', 'events', 'stays', 'social'));
