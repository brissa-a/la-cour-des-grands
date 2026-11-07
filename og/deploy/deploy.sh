#!/usr/bin/env bash
# Builds the front here, then on the Dedibox: builds the service and pipeline images, creates the data volume if missing, starts the
# pipeline's scheduler, fills the data root with a first run when it holds no version, checks the new service has a data version to serve,
# (re)starts it, then checks it from outside.
#   og/deploy/deploy.sh
#   LCDG_PHOTOS_FROM=<pipeline checkout>/output/photos og/deploy/deploy.sh   first deploy: cutouts made elsewhere, spared to the box
#   LCDG_ALLOW_OLDER_VERSION=1 og/deploy/deploy.sh   deploy a service that serves an older kept version than the one current.json names
# Roll back to an earlier deploy, with the compose file of the commit its tag names: routes and PUBLIC_ORIGIN are not in the image.
#   git show <tag>:og/deploy/docker-compose.yml > /tmp/lcdg-<tag>.yml && LCDG_TAG=<tag> docker --context abysshopper compose -f /tmp/lcdg-<tag>.yml up -d --no-build --wait --remove-orphans
# Remove the services:            NTFY_TOKEN=unused docker --context abysshopper compose -f og/deploy/docker-compose.yml down
set -euo pipefail

readonly CONTEXT=abysshopper
readonly ORIGIN=https://cour-des-grands.fr
readonly DATA_VOLUME=lcdg-data
readonly PIPELINE_USER=10002:10002
readonly NTFY_USER=lcdg_pipeline
readonly NTFY_TOKEN_FILE=$HOME/.config/ntfy/$NTFY_USER-token

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)
readonly here root

tag=$(git -C "$root" rev-parse --short=12 HEAD)
if [[ -n $(git -C "$root" status --porcelain -- og web pipeline) ]]; then tag="$tag-dirty"; fi
export LCDG_TAG=$tag

if [[ ! -r $NTFY_TOKEN_FILE ]]; then
  echo "No $NTFY_TOKEN_FILE: create the ntfy user $NTFY_USER and its token with ~/.claude/skills/ntfy-notify/scripts/add-publisher.sh $NTFY_USER" >&2
  exit 1
fi
NTFY_TOKEN=$(<"$NTFY_TOKEN_FILE")
export NTFY_TOKEN

if [[ -n ${LCDG_PHOTOS_FROM:-} && ! -f $LCDG_PHOTOS_FROM/registry.json ]]; then
  echo "LCDG_PHOTOS_FROM=$LCDG_PHOTOS_FROM holds no registry.json: it is not the output/photos folder of a pipeline checkout." >&2
  exit 1
fi

(cd "$root/web" && npm ci --no-audit --no-fund && npm run build)

docker --context "$CONTEXT" network inspect edge >/dev/null
compose=(docker --context "$CONTEXT" compose -f "$here/docker-compose.yml")
"${compose[@]}" build

if ! docker --context "$CONTEXT" volume inspect "$DATA_VOLUME" >/dev/null 2>&1; then
  docker --context "$CONTEXT" volume create "$DATA_VOLUME" >/dev/null
  # The pipeline writes the data root as its own user; lcdg-og reads it as another, through the modes the pipeline sets.
  docker --context "$CONTEXT" run --rm --network none --user 0:0 --cap-drop ALL --cap-add CHOWN --volume "$DATA_VOLUME:/data" "lcdg-pipeline:$LCDG_TAG" chown "$PIPELINE_USER" /data
fi

# The scheduler refuses to start without a token ntfy accepts or a data root it can write: the same check here stops the deploy,
# which would otherwise see a scheduler running for the moment its check takes.
"${compose[@]}" run --rm --no-TTY lcdg-pipeline node src/scheduled/main.ts check
"${compose[@]}" up --detach --no-build --wait lcdg-pipeline

if ! docker --context "$CONTEXT" run --rm --network none --read-only --volume "$DATA_VOLUME:/data:ro" "lcdg-pipeline:$LCDG_TAG" test -f /data/v2/current.json; then
  if [[ -n ${LCDG_PHOTOS_FROM:-} ]]; then
    COPYFILE_DISABLE=1 tar --no-xattrs -C "$LCDG_PHOTOS_FROM" -cf - . | "${compose[@]}" run --rm --no-TTY lcdg-pipeline tar -C output/photos -xf -
  fi
  # The cutouts still missing are left to the nightly run: this one stays within minutes.
  "${compose[@]}" run --rm --no-TTY lcdg-pipeline node src/scheduled/main.ts run --skip-new-cutouts
fi

docker --context "$CONTEXT" run --rm --network none --read-only --volume "$DATA_VOLUME:/data:ro" "lcdg-og:$LCDG_TAG" node og/src/checkData.ts ${LCDG_ALLOW_OLDER_VERSION:+--allow-older-version}
"${compose[@]}" up --detach --no-build --wait --wait-timeout 300
"${compose[@]}" ps

# A first deploy waits for its Let's Encrypt certificate, and every start for the data version to load.
for _ in $(seq 60); do
  if curl -fsS "$ORIGIN/healthz" 2>/dev/null | grep -q '"data":"ready"'; then break; fi
  sleep 2
done

(cd "$root/og" && LIVE_ORIGIN=$ORIGIN npm run test:live)
echo "lcdg-og:$LCDG_TAG and lcdg-pipeline:$LCDG_TAG are live at $ORIGIN"
