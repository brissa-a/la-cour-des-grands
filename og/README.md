# og: link previews for la cour des grands

A Node service that serves the built front (`web/dist`) and the data (`/data/v2/`, from a data root on disk), and gives each shared view its own Open Graph preview: the page's `<head>` starts with that view's tags, and `og:image` points to a 1200x630 JPEG of the view, drawn by headless Chromium from the front's `clean=capture` layout and kept on disk.

## Run

```sh
(cd ../web && npm ci && npm run build)
npm ci
node node_modules/playwright-core/cli.js install --only-shell chromium
LCDG_DATA_ROOT=test/data npm start
```

| Variable | Default | |
|---|---|---|
| `PORT` | `8080` | |
| `PUBLIC_ORIGIN` | `https://cour-des-grands.fr` | origin written in `og:url`, `og:image` and `<link rel="canonical">`; never taken from the request |
| `DIST_DIR` | `../web/dist` | the built front |
| `CACHE_DIR` | `cache` | images per data version and render, the generic image |
| `LCDG_DATA_ROOT` | `/data` | the data root the pipeline writes, read only: `v2/current.json` names the current version, `v2/<version>/` holds its files |
| `CHROMIUM_ENDPOINT` | empty | `ws://` address of a Playwright `run-server` holding Chromium; empty launches Chromium in this process |

## Routes

- `/?<view>`: the page. A query not in canonical form answers 301 to it; a link of the first site (`?layout=perage&color=sexe`) answers 301 to the view it showed, or to the default view when the v2 cannot show it; a request target over 2 KB answers 414. A link to a scrutin the data does not hold keeps its URL but gets the generic image and the generic view's texts.
- `/og/<data version>/<render>/<sha256 of the image query>.jpg?<image query>`: the view's image, immutable. The image query is the page's canonical query without `showPic`: images never show photos. The render is 12 hex digits of a sha256 of `index.html` and the capture settings, so a new front build gets new image addresses; an address of an older render or data version answers 302 to the current one. A failed, slow or refused render gets the generic image with `max-age=60`; the service never answers 429.
- `/og/fallback.jpg`: the generic image, the default view of the current data version, drawn again at each new version.
- `/data/v2/current.json`: the pointer to the current data version, `{"version":"<40 hex>","publishedAt":"<ISO 8601>"}`, as the service last read it from the data root, `max-age=60` like the page; 503 until a version has loaded.
- `/data/v2/<version>/<path>`: a file of that version, immutable. CSV, JSON, GeoJSON and SVG are compressed (brotli quality 5 or gzip, made off the event loop and kept in memory up to 32 MB); photos go as they are. A path is plain ASCII names apart by slashes, none starting with a dot: anything else, a symbolic link anywhere below the root, a folder or a missing file answers 404. Every answer under `/data/v2/` carries `Access-Control-Allow-Origin: *`: the data is open.
- `/healthz`: JSON status, always 200 while the process serves: data version, render, renders running and waiting, failures in a row and seconds since the last image drawn.
- Any other path: a file of the build by its exact path.

The data version is the one `v2/current.json` names, read every 30 seconds; the pipeline replaces it by a rename once the version's folder is complete. A version is adopted, and its pointer served, only once its catalog, deputies and scrutins load with the front's own parsers: a version whose files they refuse never reaches the browsers, which keep the previous one. The capture browser gets the page from the build and the data from the data root, pinned to the version being drawn: its `/data/v2/current.json` names that version, any other version is blocked, and so is every other origin.

Renders: 2 at a time, 12 s each at most; a request waits 8 s for its image, then gets the generic one while its render goes on. Each client (the `X-Real-Ip` Traefik sets) has a share of 2 renders, running or waiting; past it, its renders wait in a second line, which moves only when the first is empty: a robot asking for many new images at once gets them all drawn, none ahead of another client's. Each line holds 12. A robot fetching a page has its image drawn ahead only if a render slot is idle.

## Checks

`npm run check`, `npm run lint`, `npm test`, `npm run test:integration` (needs the front built and Chromium; draws from `test/data`, a small data root that `node test/makeDataRoot.ts <lcdg-data>/v2 <lcdg-nobg>/v2 test/data` builds), `npm run test:live` (the deployed site as crawlers see it; `LIVE_ORIGIN` defaults to `https://cour-des-grands.fr`), `npm run mutate` (on a scratch copy of `web/` and `og/`: it runs in place).

## Deploy

Two containers of the compose project `lcdg`, one image: `lcdg-og` (Node, on Traefik's `edge` network and the internal `capture` network) and `lcdg-chromium` (a Playwright `run-server`, on `capture` only: it reaches nothing but `lcdg-og`). Both run as uid 10001, read-only, without capabilities. Traefik limits browsers per IP (600/min on the site, 20/min and 3 at once on `/og/`), and spares the link preview robots, matched by the `User-Agent` pattern of `src/crawlers.ts`.

`deploy/deploy.sh` builds the front, builds the image on the Dedibox through the `abysshopper` Docker context (tagged with the commit), starts the project, waits for the certificate and the data, then runs `npm run test:live`. It touches nothing but that project, its image and its `lcdg_cache` volume.

```sh
compose="docker --context abysshopper compose -f og/deploy/docker-compose.yml"
docker --context abysshopper image ls lcdg-og     # the tags deployed so far
t=<tag>; git show $t:og/deploy/docker-compose.yml > /tmp/lcdg-$t.yml   # roll back to one of them, with the compose file of its commit:
LCDG_TAG=$t docker --context abysshopper compose -f /tmp/lcdg-$t.yml up -d --no-build --wait   # routes and PUBLIC_ORIGIN are not in the image
$compose logs --tail 50 lcdg-og                   # one JSON line per render
$compose down                                     # stop and remove the service; the image cache volume stays
```

Images from before the two containers (`lcdg-og:a4175637e1c1`, `lcdg-og:8f3ff62e31a4`) run as uid 1000 in one container, with the compose file of their commit. To go back to one: `$compose down`, `docker --context abysshopper volume rm lcdg_cache` (its files belong to uid 10001), then `git show 3863af3:og/deploy/docker-compose.yml > /tmp/lcdg-before.yml && LCDG_TAG=8f3ff62e31a4 docker --context abysshopper compose -f /tmp/lcdg-before.yml up -d --no-build`.

On a first deploy Traefik asks Let's Encrypt for the certificate; if that attempt fails, it only retries on its next configuration change: `LCDG_TAG=<current tag> $compose up -d --no-build --force-recreate` gives it one.
