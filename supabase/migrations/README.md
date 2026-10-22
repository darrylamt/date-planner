# Migrations

Applied by pasting into the Supabase SQL editor. There is no migrations
ledger, so a file here is not proof it ran: probe the live schema if in doubt.

- `archive/` holds 0001–0089, believed run as of 22 October 2026 (0089 probed:
  plan_signals exists and is filling).
- New migrations go here, at the top level, numbered on from 0090. Move them
  into `archive/` once they have been run.
