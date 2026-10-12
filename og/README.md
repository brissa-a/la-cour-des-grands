# og: link previews for la cour des grands

A Node service that serves the built front (`web/dist`) and gives each shared view its own Open Graph preview: the page's `<head>` starts with that view's tags, and `og:image` points to a 1200x630 JPEG of the view, drawn by headless Chromium from the front's `clean=capture` layout and kept on disk.

## Run

```sh
(cd ../web && npm ci && npm run build)
npm ci
node node_modules/playwright-core/cli.js install --only-shell chromium
npm start
```

| Variable | Default | |
|---|---|---|
| `PORT` | `8080` | |
| `PUBLIC_ORIGIN` | `https://lcdg.kxv.fr` | origin written in `og:url`, `og:image` and `<link rel="canonical">`; never taken from the request |
| `DIST_DIR` | `../web/dist` | the built front |
| `CACHE_DIR` | `cache` | images per data version and render, the generic image, the last data version |
| `CHROMIUM_ENDPOINT` | empty | `ws://` address of a Playwright `run-server` holding Chromium; empty launches Chromium in this process |

## Routes

- `/?<view>`: the page. A query not in canonical form answers 301 to it; a request target over 2 KB answers 414. A link to a scrutin the data does not hold keeps its URL but gets the generic image and the generic view's texts.
- `/og/<data version>/<render>/<sha256 of the image query>.jpg?<image query>`: the view's image, immutable. The image query is the page's canonical query without `showPic`: images never show photos. The render is 12 hex digits of a sha256 of `index.html` and the capture settings, so a new front build gets new image addresses; an address of an older render or data version answers 302 to the current one. A failed, slow or refused render gets the generic image with `max-age=60`; the service never answers 429.
- `/og/fallback.jpg`: the generic image, the default view of the current data version, drawn again at each new version.
- `/healthz`: JSON status, always 200 while the process serves: data version, render, renders running and waiting, failures in a row and seconds since the last image drawn.
- Any other path: a file of the build by its exact path.

The data version is the commit SHA of the `test-v2` branch of `brissa-a/lcdg-data`, checked every 5 minutes; the capture browser reads the data pinned to that commit, and nothing else.

Renders: 2 at a time, 12 waiting, 12 s each at most; a request waits 8 s for its image. One client (the `X-Real-Ip` Traefik sets) holds at most 2 renders, running or waiting; a robot fetching a page has its image drawn ahead only if a render slot is idle.

## Checks

`npm run check`, `npm run lint`, `npm test`, `npm run test:integration` (needs the front built, Chromium and the network), `npm run test:live` (the deployed site as crawlers see it; `LIVE_ORIGIN` defaults to `https://lcdg.kxv.fr`), `npm run mutate` (on a scratch copy of `web/` and `og/`: it runs in place).

## Deploy

Two containers of the compose project `lcdg`, one image: `lcdg-og` (Node, on Traefik's `edge` network and the internal `capture` network) and `lcdg-chromium` (a Playwright `run-server`, on `capture` only: it reaches nothing but `lcdg-og`). Both run as uid 10001, read-only, without capabilities. Traefik limits browsers per IP (600/min on the site, 20/min and 3 at once on `/og/`), and spares the link preview robots, matched by the `User-Agent` pattern of `src/crawlers.ts`.

`deploy/deploy.sh` builds the front, builds the image on the Dedibox through the `abysshopper` Docker context (tagged with the commit), starts the project, waits for the certificate and the data, then runs `npm run test:live`. It touches nothing but that project, its image and its `lcdg_cache` volume.

```sh
compose="docker --context abysshopper compose -f og/deploy/docker-compose.yml"
docker --context abysshopper image ls lcdg-og     # the tags deployed so far
LCDG_TAG=<tag> $compose up -d --no-build          # roll back to one of them, deployed with this compose file
$compose logs --tail 50 lcdg-og                   # one JSON line per render
$compose down                                     # stop and remove the service; the image cache volume stays
```

Images from before the two containers (`lcdg-og:a4175637e1c1`, `lcdg-og:8f3ff62e31a4`) run as uid 1000 in one container, with the compose file of their commit. To go back to one: `$compose down`, `docker --context abysshopper volume rm lcdg_cache` (its files belong to uid 10001), then `git show 3863af3:og/deploy/docker-compose.yml > /tmp/lcdg-before.yml && LCDG_TAG=8f3ff62e31a4 docker --context abysshopper compose -f /tmp/lcdg-before.yml up -d --no-build`.

On a first deploy Traefik asks Let's Encrypt for the certificate; if that attempt fails, it only retries on its next configuration change: `LCDG_TAG=<current tag> $compose up -d --no-build --force-recreate` gives it one.
