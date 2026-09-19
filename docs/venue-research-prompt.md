# Venue research prompt

Paste the block below into a free-tier model (DeepSeek, Gemini, Qwen — anything
with web search), followed by a batch of venue names. It returns CSV that the
admin's **Import CSV → Fill in venues** mode takes directly.

## How to run it

1. `npm run research:list` writes `venues-to-research.csv` — the active venues
   missing a description, vibe tags or best_for. 141 of 194 at last count.
2. Paste the prompt, then **20–30 names at a time**. More than that and models
   start padding the tail of the list with plausible-sounding filler, which is
   the one failure this whole exercise cannot absorb.
3. Paste the CSV it returns into `/admin/import` → **Fill in venues** → Dry run.
4. Read the dry-run report. Then Import.

Empty cells are left alone, never written as blanks, so a partial answer is
safe and re-running on the same venue later only adds.

## Why the prompt is shaped the way it is

The catalogue's only real asset is that it does not make things up. A venue
with no description is a gap; a venue with an invented one is a liability,
because it reaches a person deciding where to take somebody. So the prompt
spends most of its length on permission to say nothing, and the vocabulary is
closed — a model left to choose its own tags produces forty synonyms for
"nice" and the planner can match on none of them.

`price_band` and `aesthetics` are deliberately not askable. Those decide which
budgets a venue appears in and how it ranks, and they are ours to set.

---

## The prompt

````
You are helping fill in a directory of venues in Accra, Ghana. Accuracy matters
far more than completeness. This data is shown to people choosing where to take
someone, so a confident guess is worse than a blank.

For each venue name I give you, search for it and return one CSV row.

OUTPUT FORMAT — return only CSV, no commentary, no code fence, with exactly
this header row:

name,description,vibe_tags,best_for,cuisines,dress_code,instagram_handle

RULES

1. LEAVE IT BLANK IF YOU DO NOT KNOW.
   An empty cell is the correct, expected answer for anything you cannot
   confirm from a real source. Do not infer a venue's character from its name.
   Do not assume a place called "The Grill House" serves grills. A row that is
   just the name and six empty cells is a useful, honest answer.

2. DO NOT INVENT. No plausible-sounding descriptions, no guessed Instagram
   handles, no cuisines deduced from the venue's name. If your search returns
   nothing about a venue, return the name and blanks.

3. name — copy the name I gave you EXACTLY, character for character. It is
   matched literally against the database. Do not correct spelling, expand
   abbreviations, change capitalisation, or add or remove a branch suffix.

4. description — one or two plain sentences, max 220 characters, describing
   what the place is actually like to sit in. What a friend would say. No
   marketing language, no "nestled in the heart of", no exclamation marks.
   Write it as fact, not as a pitch. Blank if you only found an address.

5. vibe_tags — semicolon-separated, ONLY from this exact list. No other words,
   no plurals, no variations:

   casual, calm, chill, fun, lively, romantic, foodie, upscale, adventurous,
   outdoorsy, dancing, sporty, scenic, beach, artsy

   Two to four is normal. Blank if unsure. Never invent a tag: a word outside
   this list is silently dropped and the venue ends up with fewer tags than if
   you had picked carefully.

6. best_for — semicolon-separated, ONLY from this exact list:

   date_night, first_date, friend_outing, casual_hangout, anniversary

   Think about who would actually enjoy being taken there. A loud sports bar is
   friend_outing and not first_date. A quiet place with good lighting is
   first_date. Blank if unsure.

7. cuisines — semicolon-separated, lowercase, only for places that serve food,
   and only where you found the actual cuisine. Examples: ghanaian, italian,
   chinese, indian, lebanese, japanese, continental, fast food, seafood,
   pizza, grill. Blank for bars, activities and anywhere you are not sure.

8. dress_code — only if the venue actually states one. Short: "Smart casual",
   "No slippers", "Smart". Blank if not stated anywhere. Most venues have no
   stated dress code and blank is the common answer.

9. instagram_handle — the handle only, with the @, e.g. @venuename. Only if you
   found the real account and it is clearly this venue. Do not guess from the
   name. Blank if unsure. A wrong handle sends people to a stranger.

10. CSV mechanics: wrap any field containing a comma in double quotes. Never
    put a comma inside vibe_tags, best_for or cuisines — those use semicolons.
    One row per venue, in the order I listed them.

Before you answer, re-read rule 1. Most rows should have some blank cells, and
some rows will be entirely blank apart from the name. That is the expected
shape of an honest result.

Here are the venues:
````

---

## What to watch for in the dry run

- **"no venue called X"** — the model edited the name. Rule 3 exists for this;
  it is the most common failure.
- **Every row full** — nothing found nothing. Treat the batch as suspect and
  spot-check three rows against a real search before importing.
- **Tags outside the list** — dropped silently on import, so a venue that came
  back with four invented tags imports with none. Worth grepping the CSV for
  words outside the fifteen before pasting.
