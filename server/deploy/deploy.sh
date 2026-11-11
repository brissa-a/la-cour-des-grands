#!/usr/bin/env bash
# Builds the front here, then on the Dedibox: builds the service and pipeline images, creates the data volume if missing, stops a pipeline
# run in progress when its scheduler is to be replaced, starts the scheduler, fills the data root with a first run when it holds no
# version, checks the new service has a data version to serve, (re)starts it, then checks it from outside.
# It deploys the head of origin/main alone, from a checkout whose server/, web/ and pipeline/ hold no change.
#   server/deploy/deploy.sh
#   LCDG_PHOTOS_FROM=<pipeline checkout>/output/photos server/deploy/deploy.sh   first deploy: cutouts made elsewhere, spared to the box
#   LCDG_CUTOUTS_ON_BOX=1 server/deploy/deploy.sh   first deploy without them: the nightly runs cut out some 650 photos on the box, 30 min a night
#   LCDG_ALLOW_OLDER_VERSION=1 server/deploy/deploy.sh   deploy a service that serves an older kept version than the one current.json names
# Roll back to an earlier deploy, with the compose file of the commit its tag names: routes and PUBLIC_ORIGIN are not in the image.
#   git show <tag>:server/deploy/docker-compose.yml > /tmp/lcdg-<tag>.yml && NTFY_TOKEN=$(<~/.config/ntfy/lcdg_pipeline-token) LCDG_TAG=<tag> docker --context abysshopper compose -f /tmp/lcdg-<tag>.yml up -d --no-build --wait --remove-orphans
#   A tag older than the rename: og/deploy/docker-compose.yml, whose images are lcdg-og:<tag>.
# Remove the services:            NTFY_TOKEN=unused docker --context abysshopper compose -f server/deploy/docker-compose.yml down
set -euo pipefail

readonly CONTEXT=abysshopper
readonly ORIGIN=https://cour-des-grands.fr
readonly DATA_VOLUME=lcdg-data
readonly PIPELINE_USER=10002:10002
readonly PIPELINE_CONTAINER=lcdg-lcdg-pipeline-1
readonly NTFY_USER=lcdg_pipeline
readonly NTFY_TOKEN_FILE=$HOME/.config/ntfy/$NTFY_USER-token

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)
readonly here root

git -C "$root" fetch --quiet origin main
head=$(git -C "$root" rev-parse HEAD)
main=$(git -C "$root" rev-parse origin/main)
if [[ $head != "$main" ]]; then
  echo "HEAD is $head, origin/main $main: production is the head of main, deploy nothing else. Push to main first (a fast-forward), or check out origin/main." >&2
  exit 1
fi
changes=$(git -C "$root" status --porcelain --untracked-files=all -- server web pipeline)
if [[ -n $changes ]]; then
  echo "server/, web/ or pipeline/ differ from origin/main, whose commit the images would claim to be: commit and push them to main, or drop them." >&2
  echo "$changes" >&2
  exit 1
fi
export LCDG_TAG=${head:0:12}

if [[ ! -r $NTFY_TOKEN_FILE ]]; then
  echo "No $NTFY_TOKEN_FILE: create the ntfy user $NTFY_USER and its token with ~/.claude/skills/ntfy-notify/scripts/add-publisher.sh $NTFY_USER" >&2
  exit 1
fi
if [[ -n ${LCDG_PHOTOS_FROM:-} && ! -f $LCDG_PHOTOS_FROM/registry.json ]]; then
  echo "LCDG_PHOTOS_FROM=$LCDG_PHOTOS_FROM holds no registry.json: it is not the output/photos folder of a pipeline checkout." >&2
  exit 1
fi

(cd "$root/web" && npm ci --no-audit --no-fund && npm run build)

# Compose reads the token in this file whatever the command: only its process gets it, never this shell nor npm.
compose() {
  NTFY_TOKEN=$(<"$NTFY_TOKEN_FILE") docker --context "$CONTEXT" compose -f "$here/docker-compose.yml" "$@"
}

docker --context "$CONTEXT" network inspect edge >/dev/null
compose build

holds_a_version() {
  docker --context "$CONTEXT" volume inspect "$DATA_VOLUME" >/dev/null 2>&1 \
    && docker --context "$CONTEXT" run --rm --network none --read-only --volume "$DATA_VOLUME:/data:ro" "lcdg-pipeline:$LCDG_TAG" test -f /data/v2/current.json
}
first_deploy=false
if ! holds_a_version; then first_deploy=true; fi
if [[ $first_deploy == true && -z ${LCDG_PHOTOS_FROM:-} && ${LCDG_CUTOUTS_ON_BOX:-} != 1 ]]; then
  echo "$DATA_VOLUME holds no data version, and LCDG_PHOTOS_FROM names no cutouts: the box's nightly runs would cut out some 650 photos," >&2
  echo "30 minutes a night for days, each cutout never measured on the box (some 8.8 GB on a Mac); the official photos stand in meanwhile." >&2
  echo "Give LCDG_PHOTOS_FROM=<pipeline checkout>/output/photos, or LCDG_CUTOUTS_ON_BOX=1 to accept that." >&2
  exit 1
fi

if ! docker --context "$CONTEXT" volume inspect "$DATA_VOLUME" >/dev/null 2>&1; then
  docker --context "$CONTEXT" volume create "$DATA_VOLUME" >/dev/null
  # The pipeline writes the data root as its own user; lcdg-server reads it as another, through the modes the pipeline sets.
  docker --context "$CONTEXT" run --rm --network none --user 0:0 --cap-drop ALL --cap-add CHOWN --volume "$DATA_VOLUME:/data" "lcdg-pipeline:$LCDG_TAG" chown "$PIPELINE_USER" /data
fi

# compose up replaces the scheduler only when its configuration or its image changed, as compose itself compares them. A run in progress
# would then hold the replacement up to its stop_grace_period, an hour when it cuts out photos: on SIGTERM its wrapper ends it in
# seconds, the cutout in progress killed and the lock released, then alerts. Otherwise the run goes on.
stop_run_in_progress() {
  local now next
  now=$(docker --context "$CONTEXT" inspect --format '{{.State.Running}} {{index .Config.Labels "com.docker.compose.config-hash"}} {{.Image}}' "$PIPELINE_CONTAINER" 2>/dev/null) || return 0
  next="true $(compose config --hash lcdg-pipeline | cut -d' ' -f2) $(docker --context "$CONTEXT" image inspect --format '{{.Id}}' "lcdg-pipeline:$LCDG_TAG")"
  if [[ $now != "true "* || $now == "$next" ]]; then return 0; fi
  docker --context "$CONTEXT" exec -i "$PIPELINE_CONTAINER" node --input-type=module-typescript - < "$here/stopRun.ts"
}

# The scheduler refuses to start without a token ntfy accepts or a data root it can write: the same check here stops the deploy,
# which would otherwise see a scheduler running for the moment its check takes.
compose run --rm --no-TTY lcdg-pipeline node src/scheduled/main.ts check
stop_run_in_progress
compose up --detach --no-build --wait lcdg-pipeline

if [[ $first_deploy == true ]]; then
  if [[ -n ${LCDG_PHOTOS_FROM:-} ]]; then
    COPYFILE_DISABLE=1 tar --no-xattrs -C "$LCDG_PHOTOS_FROM" -cf - . | compose run --rm --no-TTY lcdg-pipeline tar -C output/photos -xf -
  fi
  # Within minutes: a deputy without a cutout gets the official photo, and the nightly runs cut out the missing ones, 30 minutes each.
  compose run --rm --no-TTY lcdg-pipeline node src/scheduled/main.ts run --skip-new-cutouts
fi

allow_older=
if [[ ${LCDG_ALLOW_OLDER_VERSION:-} == 1 ]]; then allow_older=--allow-older-version; fi
docker --context "$CONTEXT" run --rm --network none --read-only --volume "$DATA_VOLUME:/data:ro" "lcdg-server:$LCDG_TAG" node server/src/checkData.ts ${allow_older:+"$allow_older"}
# Without --remove-orphans the container of a renamed service stays up with the same Traefik labels and goes on receiving traffic.
compose up --detach --no-build --wait --wait-timeout 300 --remove-orphans
compose ps

# A first deploy waits for its Let's Encrypt certificate, and every start for the data version to load.
for _ in $(seq 60); do
  if curl -fsS "$ORIGIN/healthz" 2>/dev/null | grep -q '"data":"ready"'; then break; fi
  sleep 2
done

(cd "$root/server" && LIVE_ORIGIN=$ORIGIN npm run test:live)
echo "lcdg-server:$LCDG_TAG and lcdg-pipeline:$LCDG_TAG are live at $ORIGIN"
