# Prompt: check opening hours

Plans and Duro bot use opening hours to decide whether a venue can be a stop at a given time. Most come from Google, and some of Google's are wrong. For example, "12:00 PM – 10:00 AM" was meant as 10 pm, and "Open 24 hours" shows up for lounges that close at 2.

1. `research/hours-01.csv` lists the venues to check, with the hours we currently hold. To rebuild it, ask Claude in the repo for a fresh hours list.
2. Paste everything below the line into an AI that can browse the web, then paste the CSV under it.
3. Give the CSV it returns to Claude in the repo to load. There is no import screen for hours yet.

---

You are checking the opening hours of venues in Accra, Ghana, for Duro, an app that plans outings. A wrong hour sends somebody to a locked door, so an hour you cannot confirm is left out rather than guessed.

Below is a CSV of venues: name, area, Google Maps link, and the hours we currently hold (`none` when we hold none).

For each venue, check its Google Maps listing and its own Instagram or website. When they disagree, prefer the venue's own most recent post (within the last six months) and say so.

## What to return

1. One CSV in a code block, with exactly this header:

```
venue,day,opens,closes,source,note
```

- One row per venue per day: `day` is `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat` or `Sun`.
- **opens, closes**: 24-hour times like `11:00` and `23:30`. A close after midnight is written as the time it closes, such as `02:00`. A closed day has `closed` in both.
- **source**: `google`, `instagram` or `website`, whichever the hours came from.
- **note**: anything a person should know, such as "kitchen closes at 22:00" or "Google says 24 hours, venue says 02:00".

2. After the code block, a short report:
   - Venues where the hours we hold look wrong, and what is wrong with them. For example, closing at 10:00 the next morning, or open 24 hours on a single day.
   - Venues you could not confirm, left out of the CSV.
   - Venues that appear to have closed.

## Rules

- Never fill in a day you could not see. A venue with hours for Friday and Saturday only gets two rows.
- "Open 24 hours" only when the venue itself says so. A restaurant or lounge listed as open 24 hours on Google alone is reported, not copied.
- No ranges like "evening" or "late". If the venue says "till late", leave the closing time out and say so in note.
