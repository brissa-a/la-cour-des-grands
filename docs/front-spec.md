# Front v2 — specification

Status: increment 1 in progress. Later increments are listed at the end and will be specified when started.

## Goal

Replace the current front (`react-app/`, Create React App, React 17, Material-UI 4) with a new one that reads the v2 data published by `pipeline/` under `v2/` in [brissa-a/lcdg-data](https://github.com/brissa-a/lcdg-data).

The current site (cour-des-grands.fr, Firebase) stays online and keeps reading `deputes.json` and `scrutins.json`, which must not change. The new front is published separately on Scaleway Object Storage until it can replace the old one.

## Decisions

- **Rewrite**, in a new `web/` directory: Vite, React 19, strict TypeScript, plain CSS, no component library. Code salvaged from `react-app/`: pan and zoom of the hemicycle, deputy dots, fuzzy search and match highlighting.
- **Values are display-ready.** Jobs convert data (age, translations). The front only formats: ordering, legends, titles, figures.
- **Dedicated views over a generic fallback.** Every known feature, identified by (file, column), may get a dedicated view (color, legend, chart, profile row). Anything without one, user imports included, uses the generic view of its type.
- **Colors.** Every published `category` feature carries `colors` for all its values. An automatic palette is used only for user imports. In an import, a `<column>_color` column gives the color of `<column>`; on conflict the first row wins and the conflict is reported in "Mes données".
- **Data branch** is a single constant (`test-v2` for now).

## Increment 1 — hemicycle by group

### Scope

| Feature | Data |
|---|---|
| Hemicycle with pan and zoom (mouse, wheel, touch), deputies colored by political group, legend with seat count per group | `catalog.json`, `deputies/init.csv`, `constituencies/hemicycle.csv`, `constituencies/hemicycle.svg` |
| Optional photos on seats, stored in the URL (`?showPic=true`) | `photo` in `init.csv` |
| Deputy profile on hover, pinned on click: photo, civility, name, birth date and age, seat, constituency, group, link to the official page | `init.csv`, `deputies/links.csv` |
| Fuzzy search of deputies by last name, first name, group, department, department number, constituency number and commune, with match highlighting | `init.csv`, `deputies/communes.csv` |
| Footer: legal notice, GitHub, donation link, credit for the photo cutouts ("RMBG-2.0 de BRIA AI") | — |

Out of scope: charts, coloring by anything other than group, votes, search in votes, user imports, map layout.

### Loading

1. Before first render: `catalog.json`, `deputies/init.csv`, `constituencies/hemicycle.csv`, `constituencies/hemicycle.svg`.
2. Right after: `deputies/links.csv`.
3. On first focus of the search box: `deputies/communes.csv`. Search works on the other fields while it loads.

A failed load before first render shows an error screen. A failed later load only disables what depends on it.

### Seat placement

Only deputies with `in_office = yes` are drawn. A deputy goes to the seat of their `constituency` in `hemicycle.csv`. A deputy whose constituency has no seat is not drawn; the count is logged to the console.

### Legend order

Groups are ordered as they sit in the room, left to right, by the mean `x` of their seats.

### Done when

- The new site, built with `npm run build` in `web/`, shows the 569 deputies in office with the same seat colors as the catalog.
- Hover, pin, photos, search (including communes) work as on the current site.
- `npm run check` (type check) passes.
- It is published on Scaleway.

## Later increments

- Coloring and charts for any feature, generic by type, then dedicated views (group, vote, age, civility).
- Votes: major votes in the background, vote catalog, search in votes, past votes placed with mandate periods.
- `load` field in the catalog instead of file names known by the front.
- User imports (IndexedDB, "Mes données").
- Feature types shared with `pipeline/` so a renamed column breaks the front build.
- Switch cour-des-grands.fr to the new front.
