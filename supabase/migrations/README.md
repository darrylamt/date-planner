# Migrations

Applied by pasting into the Supabase SQL editor. There is no migrations
ledger, so a file here is not proof it ran: probe the live schema if in doubt.

- `archive/` holds 0001–0091, believed run as of 22 October 2026 (0089–0091 probed:
  plan_signals is filling, admin_menu_stats answers, venue_pull is written).
- New migrations go here, at the top level, numbered on from 0092. Move them
  into `archive/` once they have been run.
