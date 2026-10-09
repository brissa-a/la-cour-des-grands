# Front v2 — specification

Status: increment 1 done (PR #3), increment 2 in progress (2a and 2b done), increment 3 specified. Later increments are listed at the end and will be specified when started.

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

- A "Disposition" selector: hemicycle, or a chart by any feature offered for coloring. Color and layout are independent.
- Chart of a category: one column per value, in table order. Chart of a number: one column per bin, with round bin widths (5 years for age).
- Column width adapts so the chart fills the area; deputies are sorted by the current coloring inside a column. Deputies move between layouts with a transition.
- Axes: column labels, deputy count. Only deputies drawn on the hemicycle are charted.
- The selection is kept in the URL: `?chart=<file>:<column>`.

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

## Increment 3 — preview card and deputy panel

Replaces the profile shown on hover and pinned on click. Design: [Fiche d'aperçu des députés](https://claude.ai/artifact/DuFbgM5bngB6uYaQNirbL3).

### Behavior

- Hovering a seat shows a preview card anchored to it. Clicking a seat opens the full deputy panel on the right. Hovering never changes the open panel, so there is no pin.
- The selection is either none or one open deputy; the preview is separate state.
- No random deputy at load: a hint above the legend ("Survolez un point pour voir qui siège là · cliquez pour ouvrir sa fiche").
- The hovered seat gets a halo; the open deputy's seat gets a double ring that follows them across layouts.
- The legend stays visible: the hovered value is lit (chip outlined, or marker on the gradient), and the open deputy's value is marked at rest.

### Preview card

- 300 px wide, not hoverable, nothing clickable in it: to do more, open the panel.
- Content: round 88 px photo ringed with the group color, name, group short name, constituency ("Gironde (33) · 12ᵉ circ."), then the value of the current coloring with its exact dot color, unless the coloring is the group. In a chart whose layout differs from the coloring, a second line gives the layout value. A "Cliquer pour ouvrir la fiche" hint until the first click.
- Left out, kept in the panel: civility, birth date, seat number, full group name, official link.
- Placement: next to the seat, 10 px from its ring, with an arrow. Of left, right, below and above, the side covering the fewest dots without overlapping the search box, the controls, the legend, the footer or the panel; ties go towards the rostrum. The side is kept while sweeping. In a chart the card sits above the columns, linked to the dot by a thin line.
- Size depends on the coloring, the layout and the hint; a long name or constituency may take a second line, never more. Initials until the photo is decoded.
- Timing follows the pointer speed, measured over the last 100 ms. During a fast sweep only the halo and the legend react. The card opens once the pointer slows under 100 px/s, even if it still moves, and not before 100 ms after the pointer enters the stage. It then follows the seats in the same frame while the pointer stays under twice that speed, and hides on a faster move to another seat until the pointer calms down again.
- Leaving the seats: 200 ms hold, then a 100 ms fade. Hidden during pan, zoom, layout transitions and stage resizes. Escape hides it until the pointer moves to another seat.

### Deputy panel

- 380 px on the right, over the stage. Content: copy link, close button, colonnade banner with photo, civility and name, full group name, constituency, birth date and age, seat, the value in the current view, official link, a placeholder for votes.
- When it opens, the stage shrinks to the space left of the panel and the hemicycle or chart is refitted to always show whole; it is refitted to full width when the panel closes.
- Closed by the close button, Escape, a click on empty space, or Back. Clicking another seat switches deputy; clicking the open one does nothing.
- URL: `?deputy=<deputy_id>`, pushed when the panel opens, replaced when switching deputy. Loading with it opens the panel.

### Phone

- No floating card: a reader bar at the bottom shows the touched deputy, with buttons to step to the neighbouring seat. Touching the bar opens the panel as a sheet at 60 % of the height.

### Settings

- A gear next to the photos checkbox opens an editable JSON of options, checked on save: unknown keys and invalid values are listed and nothing is applied. A saved option applies at once.
- Hovering a key shows what the option does, the expected values and the default. Unknown keys say they will be refused.
- Kept in the browser per visitor; Reset returns to the defaults. If the browser refuses to store it, the option still applies for the visit and the panel says it is not saved.
- Options: `preview.openSpeedPxPerS` (100), `preview.speedWindowMs` (100), `preview.holdMs` (200), and for zoom:
  - `zoom.scrollRate` (0.002): zoom per pixel of two-finger trackpad scroll or notchless wheel, as `exp(-deltaY × rate)`. The inertia after lifting the fingers follows the same rate, so the zoom slows down with it.
  - `zoom.pinchRate` (0.01): zoom per pixel of a trackpad pinch in Chrome, Firefox and Edge, which send it as a wheel with `ctrlKey`. 0.01 keeps the point under the fingers in Chrome. Safari pinches follow the fingers exactly through its gesture events.
  - `zoom.wheelStepPercent` (10): zoom per mouse wheel notch; a large accelerated delta counts as several notches (one per 100 px). A wheel event is a mouse wheel notch when it is in lines or pages or a multiple of the macOS wheel tick (4.000244140625 px), and a trackpad under 50 px otherwise. Larger pixel deltas are read like the event before them in the burst, since trackpad inertia can be that large, and as a notch when they start one.
  - `zoom.wheelAnimationMs` (200): ease-out from the current zoom to the wheel target; a new notch moves the target without slowing the motion. 0 jumps.

### Open

- Reserve room under charts for the slanted labels, which touch the legend.
- Keyboard browsing of seats, long press on phone: later.

## Later increments

- User imports (IndexedDB, "Mes données").
- Feature types shared with `pipeline/` so a renamed column breaks the front build.
- Switch cour-des-grands.fr to the new front.
