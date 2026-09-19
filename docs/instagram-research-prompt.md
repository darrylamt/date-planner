# Instagram handle prompt

159 of 194 active venues have no handle. The venue prompt produced one in
seven batches, because its rule 9 told the model a wrong handle sends somebody
to a stranger and then gave it no way to prove it had the right one — so it
abstained on nearly everything, correctly.

This prompt gives it that way: the handle and the link it came from, together,
so the claim can be checked instead of trusted.

## How to run it

1. `npm run research:list` for names, or ask for the venues you care about.
2. Paste the prompt, then **15–20 names**. Fewer than the description batches:
   this needs a real lookup per venue rather than a paraphrase.
3. Save as `.csv`, run `npm run research:check -- that.csv`.
4. `npm run research:apply -- that.csv --write`.

`evidence_url` is read and never written. It is not a venue column; it exists
so a handle can be audited before it is believed. **A handle without a
matching evidence_url is skipped on import**, so a model that guesses gets
nothing in rather than something wrong in.

---

## The prompt

````
You are finding official Instagram accounts for venues in Accra, Ghana.

A wrong handle is worse than no handle: it sends a real person to a stranger's
account expecting a restaurant. So every handle you give must come with the
profile link you found it at, and the two must agree.

OUTPUT FORMAT — return only CSV, no commentary, with exactly this header:

name,instagram_handle,evidence_url

RULES

1. name — copy the name I gave you EXACTLY, character for character. It is
   matched literally against a database. Do not correct spelling, change
   capitalisation, or add or remove a branch suffix.

2. instagram_handle — the handle with the @, e.g. @venuename.

3. evidence_url — the full profile URL, e.g. https://instagram.com/venuename.
   The last part of this URL must be exactly the handle without its @. A
   handle that does not match its own link is rejected automatically.

4. GIVE BOTH OR NEITHER. A handle with no link is discarded on import, so a
   row with a handle and an empty evidence_url is wasted work. If you cannot
   produce the link, leave both blank.

5. WHAT COUNTS AS THE RIGHT ACCOUNT. At least one of these must be true, from
   the profile itself and not from the handle looking plausible:
   - the bio or posts name Accra, Ghana, or a neighbourhood like Osu, Labone,
     East Legon, Cantonments, Airport Residential, Spintex, Dzorwulu
   - the bio gives an address or phone number matching this venue
   - the account is linked from the venue's own website or Google listing

   A handle that merely resembles the venue's name is not evidence. There are
   restaurants with the same name in Lagos, Nairobi and London.

6. BRANCHES. Most chains run one account for all branches. If the venue name
   has a branch suffix — "- Osu", "(East Legon)" — and you can only find the
   main account, give the main account. Do not invent a branch-specific
   handle by appending the area to the main one.

7. CLOSED OR DORMANT ACCOUNTS ARE STILL CORRECT. If it is clearly this venue's
   account, give it even if the last post is old. You are identifying the
   account, not judging it.

8. If you find nothing, return the name with both fields empty. This is a
   normal and useful answer. Expect to leave a good number blank — many small
   Accra venues have no account, or only a personal one belonging to the
   owner, which does not count.

9. Never return a Facebook page, a TikTok, a website or a Linktree in
   evidence_url. Instagram profile links only.

Here are the venues:
````

---

## The check that actually matters

`research:check` fetches every handle from Instagram and prints what each
account calls itself:

```
Row 4 "805 Restaurant": @805_airport_accra is "805 Restaurant Airport"
Row 15 "Asaase Kitchen - Dome": @asaasekitchen is "Asaase Kitchen"
```

Read that list. It is the only thing that catches a handle which exists and
belongs to somebody else, and it takes fifteen seconds. A handle that does not
exist is reported as a problem and blocked; a handle whose display name has
nothing to do with the venue is reported as fine, and only you can see that it
is not.

Two things about this check are load-bearing and easy to break:

- It shells out to `curl`, because Node's own fetch gets the logged-out app
  shell for every handle -- a page titled "Instagram", identical for a real
  account and an invented one. Built on fetch, the check condemns every row.
- The user agent is deliberately short. A string containing a Chrome version
  gets that same app shell; without it Instagram serves the server-rendered
  profile whose title carries the display name. Making the UA look "more like
  a browser" silently breaks it.

## What to expect

The description batches ran at roughly 60–90% filled. The first real batch of
these came back 23 of 29, every handle real and every display name matching
its venue, which is better than expected — but do not read that as licence to
skip the display-name list.

The check will reject, before anything is written:
- a handle with no `evidence_url`
- an `evidence_url` that is not an instagram.com link
- a handle that does not match the tail of its own link

Those three cover the ways a model fabricates a handle while appearing to cite
a source. What none of them catch is a real, well-cited account that simply
belongs to a different business of the same name — rule 5 is the only defence
against that, and spot-checking five rows a batch is worth the minute.
