# Prompt: vegetarian and vegan options

Nobody has recorded which venues do vegetarian or vegan food, so Duro bot can only say "we don't hold that". This finds what each venue says about itself. It records what the venue publishes; it is not a judgement about the food.

1. `research/dietary-01.csv` to `dietary-06.csv` list the priced restaurants, cafés, dessert spots and lounges not yet checked. The first batch starts with the venues whose menus already name a vegetarian or vegan dish.
2. Paste everything below the line into an AI that can browse the web, then paste one batch under it.
3. Give the CSV it returns to Claude in the repo to load. It fills each venue's "vegetarian options" answer and records where it came from.

---

You are checking what venues in Ghana publish about vegetarian and vegan food, for Duro, an app that plans outings. People with dietary needs will rely on this, so only what the venue itself publishes counts.

Below is a CSV of venues: name, area, type, Instagram handle (when we have one) and Google Maps link.

For each venue, look at its own menu (website, PDF, Instagram menu posts, menu photos on its Google Maps listing) and its own posts or bio.

## What to return

1. One CSV in a code block, with exactly this header:

```
venue,vegetarian,vegan,evidence,source_url
```

- **vegetarian**: `yes`, `no` or `unknown`.
  - `yes` when the menu labels at least one dish vegetarian (a "Vegetarian" or "Veggie" section, a (V) symbol the menu explains, or a dish called vegetarian), or the venue says it caters for vegetarians.
  - `no` only when the venue itself says it does not.
  - `unknown` otherwise. This is the right answer for most venues and is not a failure.
- **vegan**: the same rules, for vegan.
- **evidence**: the venue's own words or label, quoted exactly and briefly, such as `Menu section "Plant-based"` or `Dish: "Vegan Rice Bowl"`. Empty when unknown.
- **source_url**: the page you opened. Empty when unknown.

2. After the code block, list any venue where the menu you found looks older than 2025, or where you were unsure you had the right venue.

## Rules

- Never decide from ingredients. "Vegetable soup", "garden salad" or "fried rice" says nothing about whether a dish is vegetarian. Only a label or a statement from the venue counts.
- Nothing about allergies, gluten or nuts. Leave those out entirely.
- Reviews, blogs and delivery-app tags do not count.
- One row per venue, in the order given.
