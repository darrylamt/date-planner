# Migrations

Applied by pasting into the Supabase SQL editor. There is no migrations
ledger, so a file here is not proof it ran: probe the live schema if in doubt.

- `archive/` holds 0001–0090, believed run as of 22 October 2026 (0089 and 0090 probed:
  plan_signals is filling, admin_menu_stats answers).
- New migrations go here, at the top level, numbered on from 0091. Move them
  into `archive/` once they have been run.
