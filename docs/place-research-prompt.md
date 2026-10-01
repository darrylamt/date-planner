# Place research prompt: map link, pin and phone

The third research job, beside the description prompt
(`venue-research-prompt.md`) and the Instagram one
(`instagram-research-prompt.md`). One Google Maps listing answers all three
questions here, and none of them is anything a description pass would find.

## How to run it

1. `npm run research:list -- --place` writes `venues-to-research-place.csv`
   and cuts it into batches of 25 at `research/place-01.csv`, `-02` and so on:
   every active venue missing a map link, a pin or a phone, with a column
   saying which.
2. Paste the prompt below, then one batch.
3. Save the CSV it returns and run `npm run research:check -- that.csv`. It
   rejects a link that is not a Google Maps link, a pin outside Ghana (usually
   lat and lng swapped) and a number too short to be one.
4. `npm run research:apply -- that.csv` shows what it would write;
   add `--write` to write it.

What apply will and will not do:

- **Fills blanks only.** A venue that already has a link, a pin or a number
  keeps it, so a batch can be re-run safely.
- **A pin is written only as a pair**, and only inside Ghana. A pin prices
  every ride to and from the venue, so a wrong one is quietly expensive.
- **A phone is never live on import.** It goes to `/admin/phones` as pending,
  because the reservation flow dials it under our name. Approve it there.

The report the model writes after the CSV is for you, not for the import:
menu links to turn into price lists with `menu-csv-prompt.md`, and any
service charge or tax a venue adds, which the app does not yet account for.

---

## The prompt

````
You are finding where venues in Ghana are and how to reach them, for a
directory people use to plan outings. Accuracy matters far more than
completeness: a wrong pin sends somebody across Accra to the wrong door, and a
wrong phone number connects them to a stranger. A blank is always a correct
answer.

Each row I give you has the venue's name, its area, and which of these fields
are missing. Find them from the venue's own Google Maps listing.

OUTPUT FORMAT: the CSV first, with exactly this header, no commentary before it:

name,google_maps_url,lat,lng,phone

Then a line that says only REPORT, then the report described at the end.

RULES

1. name: copy the name I gave you EXACTLY, character for character. It is
   matched literally against a database. Do not correct spelling, change
   capitalisation, or add or remove a branch suffix.

2. FILL ONLY WHAT IS MISSING. Each row's "missing" column says which fields to
   find ("lat;lng" means both). Leave every other field empty, even if you
   found it.

3. THE RIGHT LISTING. The listing's name and its address or area must both
   match. Many Accra venues have several branches: use the branch in the area
   I gave. A listing marked "Permanently closed" counts as not found; mention
   it in the report.

4. google_maps_url: the listing's own link, either
   https://maps.google.com/?cid=<number> or a https://maps.app.goo.gl/ share
   link. Never a search results page, and never a link to a different branch.

5. lat, lng: the listing's pin in decimal degrees, at least five decimal
   places, from the listing itself, e.g. 5.55602, -0.18310. Accra is around
   lat 5.6 and lng -0.2; latitude is the positive one. Give both or neither.
   Never estimate a pin from the area's name.

6. phone: the number shown on the venue's Google listing, its website or its
   own Instagram bio, in international form: +233 24 123 4567. Never a number
   from a review, a comment, a delivery app or someone's personal account. If
   two numbers are listed, give the one labelled for reservations or the
   first one.

7. RETURN A ROW FOR EVERY VENUE I GIVE YOU, in the order given. A venue you
   found nothing for still gets a row: its name and empty fields. Count your
   rows against my list before you answer.

8. CSV mechanics: wrap any field containing a comma in double quotes. Emit all
   five fields on every row, including trailing empty ones.

REPORT (after the line REPORT, plain text, one line per item)

- Closed or moved: any venue whose listing says closed, or that has moved.
- Menus: for each venue, a link to its menu if you saw one (a PDF, a menu
  page, photos on the listing, an Instagram highlight).
- Charges: any service charge or tax the venue adds, as printed on its menu or
  stated by the venue, e.g. "10% service charge", "prices exclude VAT and
  levies", with where you saw it.
- Not found: venues with no listing you could match.

Expect blanks. Many small venues have no phone on their listing, and an
honest blank is worth more than a filled guess.

Here are the venues:
````
