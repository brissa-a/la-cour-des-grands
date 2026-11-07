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
- `/data/v2/<version>/<path>`: a file of that version, immutable. CSV, JSON, GeoJSON and SVG are compressed (brotli quality 5 or gzip, made off the event loop, once per file and encoding however many ask for it at the same time, two files at a time, and kept in memory up to 32 MB); a body sent plain, WebP photos included, goes from the disk as it is read, 16 KB at a time, so a slow download holds next to nothing; any other type (`.html`, `.js`, `.txt`…) is never served. A path is plain ASCII names apart by slashes, none starting with a dot: anything else, a symbolic link anywhere below the root, a folder or a missing file answers 404. Every answer under `/data/v2/` carries `Access-Control-Allow-Origin: *` (the data is open) and `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, with `X-Content-Type-Options: nosniff` like every answer: an SVG opened as a page runs none of its scripts and loads nothing. Each client (the `X-Real-Ip` Traefik sets, else the connection's address) gets 256 files of a version at once, from the request to the end of its answer or of its connection; its next requests wait their turn, 1024 at most and 30 s each, then get 503 with `Retry-After: 30`, like those past the 1024. A browser asks for 250 at most at once on its HTTP/2 connection to Traefik, so a visit never waits: only a client that does not read its answers, or many visits behind one address, do. A client's place is forgotten once it has nothing running nor waiting.
- `/healthz`: JSON status, always 200 while the process serves: data version served (`version`) and the one `current.json` named at the last read (`pointed`), render, renders running and waiting, failures in a row and seconds since the last image drawn, and `downloads`: clients and data files running and waiting now, requests that waited and that got 503 since the start.
- Any other path: a file of the build by its exact path.

The data version is the one `v2/current.json` names, read every 30 seconds; the pipeline replaces it by a rename once the version's folder is complete. A version is adopted, and its pointer served, only once its catalog, deputies and scrutins load with the front's own parsers: a version whose files they refuse never reaches the browsers, which keep the previous one while the data root keeps it. When the version `current.json` names does not load, or the pointer cannot be read, and the service has no version still kept to serve (at start, or once the pipeline has pruned it), it serves the newest version of the data root that loads, by the date of its folder (the pipeline sets it to the publication), with a pointer naming it; `/healthz` then shows `version` apart from `pointed`, and the version named is tried again at each read. The capture browser gets the page from the build and the data from the data root, pinned to the version being drawn: its `/data/v2/current.json` names that version, any other version is blocked, and so is every other origin.

Renders: 2 at a time, 12 s each at most; a request waits 8 s for its image, then gets the generic one while its render goes on. Each client (the `X-Real-Ip` Traefik sets) has a share of 2 renders, running or waiting; past it, its renders wait in a second line, which moves only when the first is empty: a robot asking for many new images at once gets them all drawn, none ahead of another client's. Each line holds 12. A robot fetching a page has its image drawn ahead only if a render slot is idle.

## Checks

`npm run check`, `npm run lint`, `npm test`, `npm run test:integration` (needs the front built and Chromium; draws from `test/data`, a small data root that `node test/makeDataRoot.ts <lcdg-data>/v2 <lcdg-nobg>/v2 test/data` builds), `npm run test:live` (the deployed site as crawlers see it; `LIVE_ORIGIN` defaults to `https://cour-des-grands.fr`), `npm run mutate` (on a scratch copy of `web/` and `og/`: it runs in place).

## Deploy

Three containers of the compose project `lcdg`: `lcdg-og` (Node, on Traefik's `edge` network and the internal `capture` network) and `lcdg-chromium` (a Playwright `run-server`, on `capture` only: it reaches nothing but `lcdg-og`) share the image `lcdg-og` and run as uid 10001; `lcdg-pipeline` (image `lcdg-pipeline`, `pipeline/deploy/Dockerfile`, uid 10002, on a network of its own) runs the pipeline every night at 04:30, Paris time, and sends its outcome to ntfy as the user `lcdg_pipeline` (see `pipeline/README.md`). All three run read-only, without capabilities. The pipeline writes the data root to the volume `lcdg-data`, which `lcdg-og` mounts read-only at `/data`; the compose project never creates that volume, `deploy.sh` does. Traefik limits browsers per IP (600/min on the site, 3000/min with bursts of 1500 on `/data/`, where a page showing the photos asks for some 600 files at once, 20/min and 3 at once on `/og/`), and spares the link preview robots, matched by the `User-Agent` pattern of `src/crawlers.ts`.

`deploy/deploy.sh` reads the ntfy token from `~/.config/ntfy/lcdg_pipeline-token` (made by the ntfy-notify skill's `add-publisher.sh lcdg_pipeline`) and passes it as `NTFY_TOKEN` to each compose command alone, never to npm: every compose command on this file needs that variable. It builds the front, builds both images on the Dedibox through the `abysshopper` Docker context (tagged with the commit), creates `lcdg-data` if missing (owned by uid 10002), starts `lcdg-pipeline`, whose scheduler refuses to start without a token ntfy accepts; when `lcdg-data` holds no `v2/current.json`, it copies in the cutouts `LCDG_PHOTOS_FROM` names and waits for a first run of the pipeline to succeed; without `LCDG_PHOTOS_FROM` it stops once the images are built, before it creates the volume or starts anything, unless `LCDG_CUTOUTS_ON_BOX=1` accepts that the nightly runs cut out some 650 photos there. Then it checks with the new `lcdg-og` image (`src/checkData.ts`, without network, the volume read-only) that the service would serve the version `current.json` names, and stops there if not (`LCDG_ALLOW_OLDER_VERSION=1` accepts an older kept version); then it starts the project, waits for the certificate and the data, and runs `npm run test:live`. It touches nothing but that project, its images and its volumes, and creates `lcdg-data`.

```sh
export NTFY_TOKEN=$(<~/.config/ntfy/lcdg_pipeline-token)
compose="docker --context abysshopper compose -f og/deploy/docker-compose.yml"
docker --context abysshopper image ls lcdg-og     # the tags deployed so far
t=<tag>; git show $t:og/deploy/docker-compose.yml > /tmp/lcdg-$t.yml   # roll back to one of them, with the compose file of its commit:
LCDG_TAG=$t docker --context abysshopper compose -f /tmp/lcdg-$t.yml up -d --no-build --wait --remove-orphans   # routes and PUBLIC_ORIGIN are not in the image
$compose logs --tail 50 lcdg-og                   # one JSON line per render
$compose logs --tail 100 lcdg-pipeline            # the scheduler and the runs
docker --context abysshopper exec lcdg-lcdg-pipeline-1 node src/scheduled/main.ts run   # a run now, alerts included
$compose down                                     # stop and remove the services; the volumes stay
```

Images from before the two containers (`lcdg-og:a4175637e1c1`, `lcdg-og:8f3ff62e31a4`) run as uid 1000 in one container, with the compose file of their commit. To go back to one: `$compose down`, `docker --context abysshopper volume rm lcdg_cache` (its files belong to uid 10001), then `git show 3863af3:og/deploy/docker-compose.yml > /tmp/lcdg-before.yml && LCDG_TAG=8f3ff62e31a4 docker --context abysshopper compose -f /tmp/lcdg-before.yml up -d --no-build`.

On a first deploy Traefik asks Let's Encrypt for the certificate; if that attempt fails, it only retries on its next configuration change: `LCDG_TAG=<current tag> $compose up -d --no-build --force-recreate` gives it one.
