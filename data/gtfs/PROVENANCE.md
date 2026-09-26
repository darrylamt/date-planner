# Trotro route maps, kept as downloaded

Copies of the GTFS feeds aduro's trotro planner is built from, or may be.
They are here so a reload never depends on the source staying online, and
so the exact version in use is on record. Do not edit these files; corrections
belong in the database, through the admin.

Downloaded 26 September 2026.

## Accra: in use

| File | What it is |
|---|---|
| `accra-GTFS_Accra.zip` | The feed imported into `trotro_stops`, `trotro_lines` and `trotro_line_stops` by `npm run transit:import`. |
| `accra-LICENSE` | The repository's licence file, as shipped. |
| `accra-README.md` | The repository's readme, as shipped. |

- Source: <https://gitlab.com/digitaltransport/data/africa/accra> (`master`,
  last commit `f04f2f1209f4235a832c7008463bd6eb019e32a2`, 5 November 2019)
- Published by OpenStreetMap Ghana with Digital Transport for Africa.
  Feed dates 4 March 2019 to 31 January 2020.
- 277 routes, 554 directions, 4,171 stops. No fares. Minutes between stops
  are estimated from distance; the 05:00-22:00 service hours are a placeholder.
- Licence: **ODbL 1.0** (see `accra-LICENSE`). Credit "© OpenStreetMap
  contributors" wherever routes are shown, and keep our derivative available,
  which `/api/transit/data` does.

## Kumasi: kept for later, not imported

| File | What it is |
|---|---|
| `kumasi-GTFS.zip` | Dated October 2019. 27 routes, 48 directions, 401 stops, with frequencies. Agency named "bus". |
| `kumasi-GTFS-Kumasi.zip` | Dated February 2022, inside a folder called `TEST GTFS`. 668 routes, 704 stops, but only 2,519 stop times: about four stops per route, so mostly end points rather than the road. Placeholder agency, and the time zone set to America/New_York. |

- Source: <https://gitlab.com/digitaltransport/data/africa/kumasi> (`master`,
  last commit `c95e4108aa331753bb895940e8fd73fb0d0fd21e`, 10 July 2022)
- **No licence file in the repository.** It is almost certainly built from
  OpenStreetMap like Accra, which would make it ODbL, but that is an
  assumption. Confirm with Digital Transport for Africa before shipping it.
- Neither file is Accra's quality. Expect the 2019 one to give a thin
  skeleton of main corridors and the 2022 one to give route end points; both
  need checking on the ground before a visitor is sent anywhere by them.
- Loading it will need the import to take a city, so Kumasi lines stay apart
  from Accra's in the admin and on the page.
