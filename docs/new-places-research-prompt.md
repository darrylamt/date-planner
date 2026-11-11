# New places research prompt: venues, activities, sights and stays

For finding places Duro! does not have yet, across Ghana, with 2026 prices.
The others in `docs/` fill in venues we already hold; this one adds new ones.

## How to run it

1. Paste the prompt below into the research AI (one with web search), then one
   line naming the destinations for this batch, e.g.
   `Batch: Kakum, Lake Bosomtwe, Wli, Afadjato` (four or five at a time).
2. Save the CSV it returns, e.g. `research/new-places-01.csv`.
3. `npx tsx --env-file=.env.local scripts/import-research-places.ts research/new-places-01.csv`
   shows what it would add: each row is matched to its Google Maps listing,
   and rows that cannot be found, are closed, or are already held are listed
   and skipped. Add `--write` to add them.
4. Then run `scripts/places-facts.ts`, `scripts/describe-venues.ts --reviews`,
   `scripts/venue-photos.ts` and `scripts/sight-photos.ts` for their details
   and photos.

Destinations most in need (11 Nov 2026): Kakum, Lake Bosomtwe, Wli, Afadjato,
Ada, Nzulezo/Beyin, Mole, Larabanga, Kintampo, Wa, Paga. After those, any
town: activities with prices are scarce everywhere.

---

## The prompt

````
You are researching places to go in Ghana for an outing and trip planner
that real people use to spend real money. Wrong information sends someone
somewhere closed or charges them the wrong price. A blank is always a
correct answer; a guess never is.

I will name a few destinations. For each, find places a visitor would go:
- activities: tours, boat rides, canopy walks, hikes with guides, cultural
  experiences, craft workshops (kente, pottery, beads), cooking classes,
  water sports, horse riding, zip lines, farms you can visit
- sights: waterfalls, forts, museums, parks, sanctuaries, lakes, monuments,
  markets worth visiting
- places to eat and drink: restaurants, chop bars, cafes, bars, lounges,
  beach bars
- places to stay: hotels, lodges, eco-lodges, guesthouses, resorts, campsites

Aim for 8 to 15 places per destination, the best ones first. Only places
that exist and are operating in 2026. Within about 15 km of the destination.

OUTPUT FORMAT: the CSV first, with exactly this header, no commentary and no
code fence before it:

name,type,town,destination,what_it_is,entry_fee_ghs,entry_fee_visitor_ghs,price_per_night_ghs,room_name,price_note,price_source_url,price_seen,phone,website,confidence

Then a line that says only REPORT, then a short report: what you could not
find, and any place you were unsure was still open.

RULES

1. name: the place's name exactly as it appears on its Google Maps listing,
   so it can be matched. No added descriptions.

2. type: exactly one of
   restaurant   (a meal: restaurants, chop bars, grills)
   cafe         (coffee, breakfast, light meals)
   lounge       (bars, pubs, lounges, beach bars, nightlife)
   activity     (something you do or book: tours, workshops, museums, classes)
   outdoor      (sights and nature: waterfalls, parks, beaches, hikes, lakes)
   stay         (somewhere to sleep)

3. town: the town or village it is in. destination: which of the destinations
   I named it belongs to.

4. what_it_is: one plain sentence of what it offers, from its own pages or
   listings. Concrete: "Guided canoe trip through the mangroves to the stilt
   village", not "A must-see gem". No superlatives.

5. PRICES: only a price you actually saw printed, in Ghana cedis, on a page
   dated 2026 or on the place's own current page or official notice.
   - entry_fee_ghs: what a Ghanaian adult pays to enter or take part.
     0 only if it is plainly free.
   - entry_fee_visitor_ghs: what a non-Ghanaian adult pays, if the place
     charges visitors differently. Blank if one price for everyone.
   - price_per_night_ghs and room_name: for stays only, the cheapest standard
     room's nightly rate the place itself publishes.
   - price_note: anything that qualifies it ("per person, guide included",
     "upper falls hike extra GH¢60").
   - price_source_url: the page you read it on. price_seen: the date shown
     on that page, or "current page" for the place's own live price list.
   - A price in dollars: leave the cedi fields blank and put it in price_note.
   - A price from 2025 or earlier, a forum post, a tour package that bundles
     many things, or a booking site's "from" price: leave the price blank.
   - NEVER estimate, convert, round or average.

6. phone: only the number on the place's own website or Google listing,
   in +233 form. website: its own site, not a social page or booking site.

7. confidence: high, medium or low that the row is right and current. Mark
   low anything you found only on one old listing.

8. Do not include places outside Ghana (Wli, Afadjato and Paga are on the
   border: check the address says Ghana). Do not include chains' head
   offices, car parks, ticket offices, or the town itself.

9. CSV mechanics: wrap any field containing a comma in double quotes. One
   place per row. No blank lines.
````
