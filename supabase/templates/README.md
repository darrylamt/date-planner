# Loading a real catalog

Import at `/admin/import` (sign in as an admin first). **Venues before menu
items** — the menu importer matches venues by exact name, so a menu row whose
`venue` does not match an already-imported venue is skipped.

## venues.csv

| Column | Required | Notes |
| --- | --- | --- |
| `name` | yes | Must be unique and exact — menu_items.csv joins on it |
| `type` | yes | `restaurant`, `activity`, `lounge`, `outdoor`, `cafe`, `dessert` |
| `area` | yes | Must match an existing area name exactly (Osu, Labone, Cantonments, East Legon, Achimota, Airport Residential, Dzorwulu, Spintex) |
| `price_band` | no | `budget`, `mid`, `premium` — defaults to `mid` |
| `avg_cost_per_person_ghs` | yes | Drives the budget pre-filter. A wrong value here silently excludes the venue from plans |
| `description` | yes | One or two sentences, shown to users. Quote it if it contains a comma |
| `vibe_tags` | yes | `;`-separated. Match the app's vibes: `romantic`, `calm`, `lively`, `fun`, `adventurous`, `chill` |
| `best_for` | no | `;`-separated: `first_date`, `anniversary`, `date_night`, `friend_outing` |
| `reservation_required` | no | `true`/`yes`/`1` — drives the Reserve button |
| `dress_code` | no | Free text |
| `instagram_handle` | no | With or without `@` |
| `phone` | no | **Full international format** (`+233…`). The reservation flow strips non-digits and opens `wa.me/<digits>`; a local `0…` number produces a dead WhatsApp link |
| `google_maps_url` | no | Falls back to an Apple Maps name search if absent |
| `image_url` | no | Must be a direct image URL, publicly reachable, not a page URL |
| `lat`, `lng` | strongly recommended | Without both, every hop to or from this venue is costed at a flat GHS 40 / 15 min instead of by distance |

## menu_items.csv

| Column | Required | Notes |
| --- | --- | --- |
| `venue` | yes | Exact venue name |
| `name` | yes | Dish or item name |
| `category` | yes | `starter`, `main`, `dessert`, `drink`, `other` |
| `price_ghs` | yes | Price for **one** item. The planner multiplies by quantity |
| `notes` | no | e.g. "Serves two", "Vegetarian" |

## Why the prices matter more than they look

The planner does not estimate costs — it sums real `menu_items` rows and
checks the total against the user's budget. A venue with no menu items can
still be chosen for an activity stop, but it can never carry a food order.
`avg_cost_per_person_ghs` is only used for the pre-filter that decides which
venues the model is even shown.

So: a venue with no menu rows and a low `avg_cost_per_person_ghs` will be
offered constantly and cost nothing. That is the main way a real catalog
produces unrealistic plans.
