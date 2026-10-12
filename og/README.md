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
| `CACHE_DIR` | `cache` | images per data version, the generic image, the last data version |

## Routes

- `/?<view>`: the page. A query not in canonical form answers 301 to it; a request target over 2 KB answers 414.
- `/og/<data version>/<sha256 of the canonical query>.jpg?<canonical query>`: the view's image, immutable. A failed, slow or refused render gets the generic image with `max-age=60`; the service never answers 429.
- `/og/fallback.jpg`: the generic image (the default view, drawn at start).
- `/healthz`: JSON status for the container health check.
- Any other path: a file of the build by its exact path.

The data version is the commit SHA of the `test-v2` branch of `brissa-a/lcdg-data`, checked every 5 minutes; the capture browser reads the data pinned to that commit.

## Checks

`npm run check`, `npm run lint`, `npm test`, `npm run test:integration` (needs the front built, Chromium and the network), `npm run test:live` (the deployed site as crawlers see it; `LIVE_ORIGIN` defaults to `https://lcdg.kxv.fr`), `npm run mutate` (on a scratch copy of `web/` and `og/`: it runs in place).

## Deploy

`deploy/deploy.sh` builds the front, builds the image on the Dedibox through the `abysshopper` Docker context (tagged with the commit), starts the compose project `lcdg` behind Traefik on the `edge` network, waits for the certificate and the data, then runs `npm run test:live`. It touches nothing but that project, its image and its `lcdg_cache` volume.

```sh
compose="docker --context abysshopper compose -f og/deploy/docker-compose.yml"
docker --context abysshopper image ls lcdg-og     # the tags deployed so far
LCDG_TAG=<tag> $compose up -d --no-build          # roll back to one of them
$compose logs --tail 50                           # one JSON line per render
$compose down                                     # stop and remove the service; the image cache volume stays
```

On a first deploy Traefik asks Let's Encrypt for the certificate; if that attempt fails, it only retries on its next configuration change: `LCDG_TAG=<current tag> $compose up -d --no-build --force-recreate` gives it one.
