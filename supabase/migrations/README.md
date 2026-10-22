# Migrations

Applied by pasting into the Supabase SQL editor. There is no migrations
ledger, so a file here is not proof it ran: probe the live schema if in doubt.

- `archive/` holds 0001–0093, believed run as of 22 October 2026 (0089–0093 probed:
  plan_signals is filling, admin_menu_stats answers, venue_pull and
  venue_embeddings are written, dish signals are accepted).
- New migrations go here, at the top level, numbered on from 0094. Move them
  into `archive/` once they have been run.
