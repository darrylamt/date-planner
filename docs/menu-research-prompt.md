# Prompt: find menus for venues we cannot price yet

About half the switched-on venues have no menu prices, so plans and Duro bot skip them. This finds where each one's menu is published. Turning a menu into rows is a second step, one venue at a time, with docs/menu-csv-prompt.md.

1. Run `npm run research:list -- --menu`. It writes batches of 25 to `research/menu-01.csv`, `menu-02.csv` and so on.
2. Paste everything below the line into an AI that can browse the web, then paste one batch under it.
3. For each venue it finds a usable menu for, open the source, save the menu pages as photos or a PDF, and run docs/menu-csv-prompt.md on them. Upload the CSV at Admin > Import > Menu items.

---

You are finding published menus for venues in Ghana, for Duro, an app that plans outings from real menus and real prices. A price that ends up in a plan is a price somebody pays, so a menu you cannot see is better reported missing than guessed.

Below is a CSV of venues: name, area, city, type, Instagram handle (when we have one) and a Google Maps link.

For each venue, look in this order and stop at the first that shows a full priced menu:

1. The venue's own website, including PDF menus.
2. The venue's Instagram: highlights named Menu, pinned posts, and recent posts showing the menu.
3. Menu photos on its Google Maps listing.
4. A delivery app (Bolt Food, Glovo, Jumia Food). Use these last and always say so: delivery prices are often higher than in the venue.

## What to return

One table with a row per venue, in the order given:

| venue | found | source_url | source_kind | menu_date | prices_visible | covers | notes |

- **venue**: the name exactly as given.
- **found**: `yes` when a priced menu is published, `partial` when only some sections are priced or readable, `no` when you found nothing usable.
- **source_url**: the page you actually opened. Never a search results page.
- **source_kind**: `website`, `pdf`, `instagram`, `google_maps_photos` or `delivery_app`.
- **menu_date**: when the menu was posted or last updated, as best you can tell (`2026-08`, `2025`), or `unknown`.
- **prices_visible**: `yes` if the prices can be read, `no` if the menu has no prices or they are too small or blurry.
- **covers**: what the menu covers, such as `food and drinks`, `drinks only` or `activities price list`.
- **notes**: anything that matters. For example, the venue has moved or closed, the menu is older than 2025, the prices are in another currency, or the Instagram handle we hold is wrong (give the right one).

## Rules

- Only report a menu you actually opened. Do not describe a menu from memory or from a review.
- A menu older than January 2025 is `partial` at best, with its date in notes: prices in Accra move quickly.
- Never copy prices from a review, a blog, or a TikTok caption. Those are somebody's memory of a price.
- If a venue appears to have closed, say so in notes and do not look further.
- If you are unsure the account or website is the right venue (same name, different town), say `no` and explain in notes.

After the table, list the venues with `found: yes` and `prices_visible: yes`, most complete first. Those are ready to turn into rows.
