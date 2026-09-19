# Verification prompt

The research passes filled 184 descriptions, 92 cuisines and a great many
tags. None of it was checked against anything. This is the pass that asks a
second model whether the first one was right — and, more usefully, whether the
venue still exists at all.

## The rule this pass is built on

**A model disagreeing with a fact is not proof the fact is wrong.** It is
proof that two models disagree, which is a reason to look, not a reason to
overwrite. So this prompt produces a *report*, never a CSV to import. Nothing
here writes to the catalogue. You read the flags and decide.

That is why there is no `research:apply` step below. There deliberately isn't
one.

## What is worth verifying, in order

1. **Still open.** A closed venue is the only error that ruins an evening
   outright — somebody drives across Accra to a locked door. Everything else
   is a disappointment; this is a failure.
2. **Still at that address.** Accra venues move. A wrong area silently breaks
   the fare between stops and puts a plan in two districts it thinks are one.
3. **The description still true.** A place that was a quiet café and is now a
   nightclub is worse than a place with no description.
4. **Cuisine and tags.** Lowest stakes, because a wrong vibe tag makes a plan
   slightly off rather than wrong.

## How to run it

1. Export what to check — the oldest data first, not what you just wrote:
   `npm run research:list` gives names; pull the descriptions you want checked
   from the admin, or ask me and I will produce the file.
2. Paste the prompt, then **10–15 venues with their current descriptions**.
   Fewer than a research batch: this asks for a judgement per venue, not a
   lookup.
3. Read the output yourself. Fix what you agree with in the admin.

---

## The prompt

````
You are checking whether facts already recorded about venues in Accra, Ghana
are still true. You are not writing new descriptions.

For each venue I give you — a name and the description currently on file —
search for it and report whether what we hold still matches what you find.

OUTPUT FORMAT — return only this, one block per venue, no CSV, no preamble:

NAME: <the name exactly as I gave it>
STATUS: OPEN | CLOSED | MOVED | CANNOT TELL
DESCRIPTION: AGREES | DISAGREES | CANNOT TELL
WHAT CHANGED: <one line, or "-">
SOURCE: <the URL you relied on, or "-">

RULES

1. "CANNOT TELL" IS THE MOST COMMON CORRECT ANSWER, and it is not a failure.
   Small Accra venues have little online presence, and the absence of recent
   information is not evidence a place has closed. Never report CLOSED because
   you found nothing. Report CLOSED only when something actually says so: a
   permanent-closure notice on a listing, a farewell post, a news item.

2. Absence of evidence is not evidence. A venue with no posts since 2024 is a
   venue with no posts since 2024. Say CANNOT TELL.

3. DISAGREES means the description contradicts what you found, not that you
   would have written it differently. "A quiet café" against a venue that is
   now a nightclub is a disagreement. "A quiet café" against a venue you would
   have called "a relaxed coffee spot" is not. Do not report style.

4. MOVED only with a new address. If you believe it moved but cannot say
   where, that is CANNOT TELL with a note.

5. SOURCE must be a real URL you actually used. If you have no URL, every
   field on that venue is CANNOT TELL. A judgement with no source is the thing
   this whole exercise exists to catch.

6. Do not soften. If a venue has clearly closed, say CLOSED plainly. If the
   description is clearly wrong, say DISAGREES. Hedging everything to
   CANNOT TELL is as useless as inventing certainty.

7. Report on every venue I list, in order, including ones you know nothing
   about.

Here are the venues and what we currently hold:
````

---

## Reading the output

- **CLOSED with a source** — check it, then set `is_active = false` in the
  admin rather than deleting. A closed venue that reopens is a row you want
  back, and plans already saved reference it.
- **MOVED with an address** — the area matters more than the street. A venue
  that crossed from Osu to East Legon changes every fare in a plan built
  around it.
- **DISAGREES** — read both and decide. The description on file was itself
  written by a model; a second model disagreeing means one of them is wrong,
  and it is not automatically the older one.
- **CANNOT TELL everywhere** — expect a lot of this, especially for the ~10
  venues no research pass could describe. It tells you those need a phone
  call, which is itself worth knowing.

## What this cannot do

It cannot tell you a price changed, because it never knew the price. Menu
prices are the catalogue's most perishable data and the least visible online
— that gap closes through the venue portal or not at all.
