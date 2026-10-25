# Migrations

Applied by pasting into the Supabase SQL editor. There is no migrations
ledger, so a file here is not proof it ran: probe the live schema if in doubt.

- `archive/` holds 0001–0095, believed run as of 25 October 2026 (0089–0095 probed:
  plan_signals is filling, admin_menu_stats answers, venue_pull and
  venue_embeddings are written, dish signals are accepted, venue_response
  gates, staff roles pass npm run staff:smoke).
- New migrations go here, at the top level, numbered on from 0096. Move them
  into `archive/` once they have been run.
