# Migrations

Applied by pasting into the Supabase SQL editor. There is no migrations
ledger, so a file here is not proof it ran: probe the live schema if in doubt.

- `archive/` holds 0001–0099, believed run as of 28 October 2026 (0089–0099 probed:
  plan_signals is filling, admin_menu_stats answers, venue_pull and
  venue_embeddings are written, dish signals are accepted, venue_response
  gates, staff roles pass npm run staff:smoke, and every dish carries
  Gemini's dish_role, which npm run meal:smoke reads; usage_events takes
  events, rate_hit answers, stay_details and stay_rooms exist and are closed
  to anon, and npm run audit:smoke passes 23/23 after 0099).
- 0100_nudges.sql ran on 30 October 2026 (probed 4 Nov: notification_prefs
  holds people's choices, nudge_sends answers, anon sees neither); in `archive/`.
- 0101_trips.sql ran on 3 November 2026 (probed: 26 destinations and 50
  routes, both tables refuse anon, npm run audit:smoke 23/23); it is in
  `archive/` too. 0102_trip_demand.sql ran the same day (probed: the table
  answers the server and refuses anon both ways; audit:smoke 23/23).
  0103_venue_stars.sql ran the same day (probed: a free account stops at
  10, Pro does not, nobody sees or writes another's stars; audit:smoke 23/23).
- 0104_featured_events.sql ran on 5 November 2026 (probed: featured_venues
  carries event_id and the rugby final's slot pointed at its event); in `archive/`.
- New migrations go here, at the top level, numbered on from 0100. Move them
  into `archive/` once they have been run.
