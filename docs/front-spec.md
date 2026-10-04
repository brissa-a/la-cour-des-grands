# Front v2 — specification

Status: increment 1 done (PR #3), increment 2 being specified. Later increments are listed at the end and will be specified when started.

## Goal

Replace the current front (`react-app/`, Create React App, React 17, Material-UI 4) with a new one that reads the v2 data published by `pipeline/` under `v2/` in [brissa-a/lcdg-data](https://github.com/brissa-a/lcdg-data).

The current site (cour-des-grands.fr, Firebase) stays online and keeps reading `deputes.json` and `scrutins.json`, which must not change. The new front is published separately on Scaleway Object Storage until it can replace the old one.

## Decisions

- **Rewrite**, in a new `web/` directory: Vite, React 19, strict TypeScript, plain CSS, no component library. Code salvaged from `react-app/`: pan and zoom of the hemicycle, deputy dots, fuzzy search and match highlighting.
- **Values are display-ready.** Jobs convert data (age, labels). The front only formats: ordering, legends, titles, figures.
- **Data files stay neutral.** They describe the data, not how or when the site uses it. The front decides what it loads and when, and owns the style.
- **Category values tables.** A `category` feature points to a values table, `<entity>/values/<column>.csv`, one row per possible value in display order: `value` (the code written in data files), `label_fr`, and optional columns such as `short_fr` (groups) or `color`. Several files with the same kind of value share one table (e.g. `deputies/values/vote_position.csv` for every vote file). The catalog only links to it: `"values": "<path>"`.
- **Dedicated views over a generic fallback.** Every known feature, identified by (file, column), may get a dedicated view (color, legend, chart, profile row). Anything without one, user imports included, uses the generic view of its type.
- **Colors.** A values table has a `color` column only for official colors (groups) or colors deliberately chosen for that data. Otherwise colors are front style: palettes for categories, gradients for numbers. In an import, a `<column>_color` column gives the color of `<column>`; on conflict the first row wins and the conflict is reported in "Mes données".
- **Data branch** is a single constant (`test-v2` for now).

## Increment 1 — hemicycle by group

### Scope

| Feature | Data |
|---|---|
| Hemicycle with pan and zoom (mouse, wheel, touch), deputies colored by political group, legend with seat count per group | `catalog.json`, `deputies/init.csv`, `seats/hemicycle.csv`, `seats/hemicycle.svg` |
| Optional photos on seats, stored in the URL (`?showPic=true`) | `photo` in `init.csv` |
| Deputy profile on hover, pinned on click: photo, civility, name, birth date and age, seat, constituency, group, link to the official page | `init.csv`, `deputies/links.csv` |
| Fuzzy search of deputies by last name, first name, group, department, department number, constituency number and commune, with match highlighting | `init.csv`, `deputies/communes.csv` |
| Footer: legal notice, GitHub, donation link, credit for the photo cutouts ("RMBG-2.0 de BRIA AI") | — |

Out of scope: charts, coloring by anything other than group, votes, search in votes, user imports, map layout.

### Loading

1. Before first render: `catalog.json`, `deputies/init.csv`, `seats/hemicycle.csv`, `seats/hemicycle.svg`.
2. Right after: `deputies/links.csv`.
3. On first focus of the search box: `deputies/communes.csv`. Search works on the other fields while it loads.

A failed load before first render shows an error screen. A failed later load only disables what depends on it.

### Seat placement

`seats/hemicycle.csv` has one row per seat of the room (582), with the deputy in office sitting there, if any. Deputies with `in_office = yes` are drawn at their seat; empty seats are drawn as outlines. A deputy in office without a seat is not drawn and is logged to the console.

For past votes (later increment): seat → current deputy → their `constituency` → the deputy holding it at the vote date, from `mandate_periods`.

### Legend order

Groups are ordered as they sit in the room, left to right, by the mean `x` of their seats.

### Done when

- The new site, built with `npm run build` in `web/`, shows the 569 deputies in office with the same seat colors as the catalog.
- Hover, pin, photos, search (including communes) work as on the current site.
- `npm run check` (type check) passes.
- It is published on Scaleway.

## Increment 2 — color, charts, votes

Delivered in four steps, each published on the preview.

Depends on the pipeline: values tables, `group_short` moved to `deputies/values/group.csv`, vote link column in `votes/votes.csv`.

### 2a. Color by any feature

- A "Colorier par" selector lists the `category` and `number` features of the deputy files, titled from the catalog, grouped by file.
- Generic category view: one color per value, from the `color` column of the values table when present, else a front palette; legend in table order, with labels from `label_fr` and counts.
- Generic number view: front gradient between the min and max of the drawn deputies; legend with min, max and mean.
- A deputy without a value (empty cell) is drawn neutral grey and counted under "Non renseigné".
- Dedicated views: group (official colors, `short_fr` in the legend, left to right), age (5 graduations).
- The selection is kept in the URL: `?color=<file>:<column>`.

### 2b. Charts

- A "Disposition" selector: hemicycle or chart.
- Chart of a category: one column per value, in table order. Chart of a number: one column per bin, with round bin widths (5 years for age).
- Columns are 10 deputies wide, deputies sorted by group inside a column. Deputies move between layouts with a transition.
- Axes: column labels, deputy count. Only deputies drawn on the hemicycle are charted.
- The selection is kept in the URL: `?layout=chart&by=<file>:<column>`.

### 2c. Major votes

- `deputies/major-votes.csv` loads in the background after first render; `votes/votes.csv` loads when the vote picker opens.
- The vote picker lists major votes, newest first, with date, title and result.
- Coloring by a vote uses `deputies/values/vote_position.csv`; position colors are front style (pour green, contre red, abstention yellow, non-votant and absent greys).
- A vote header shows its title, date, result, count per position and the link to the official page.
- A past vote is shown with the deputies who held each seat's constituency on the vote date: seat → current deputy → `constituency` → deputy whose `mandate_periods` covers the date. A seat with no such deputy is drawn empty.
- The selection is kept in the URL: `?vote=<vote_id>`.

### 2d. Search in votes

- The search box gets two modes: deputies, votes.
- Vote search is fuzzy over the titles of `votes/votes.csv`, ranked by score then date.
- Picking a vote loads the file named in its `file` column, whole, and colors by that vote.

## Later increments

- User imports (IndexedDB, "Mes données").
- Feature types shared with `pipeline/` so a renamed column breaks the front build.
- Switch cour-des-grands.fr to the new front.
