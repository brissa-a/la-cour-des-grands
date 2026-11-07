#!/usr/bin/env bash
# Builds the front here, then builds the preview service on the Dedibox, checks it has a data version to serve, (re)starts it, then checks it from outside.
#   og/deploy/deploy.sh
# Roll back to an earlier deploy, with the compose file of the commit its tag names: routes and PUBLIC_ORIGIN are not in the image.
#   git show <tag>:og/deploy/docker-compose.yml > /tmp/lcdg-<tag>.yml && LCDG_TAG=<tag> docker --context abysshopper compose -f /tmp/lcdg-<tag>.yml up -d --no-build --wait
# Remove the service:             docker --context abysshopper compose -f og/deploy/docker-compose.yml down
set -euo pipefail

readonly CONTEXT=abysshopper
readonly ORIGIN=https://cour-des-grands.fr
readonly DATA_VOLUME=lcdg-data

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)
readonly here root

tag=$(git -C "$root" rev-parse --short=12 HEAD)
if [[ -n $(git -C "$root" status --porcelain -- og web) ]]; then tag="$tag-dirty"; fi
export LCDG_TAG=$tag

(cd "$root/web" && npm ci --no-audit --no-fund && npm run build)

docker --context "$CONTEXT" network inspect edge >/dev/null
# docker run would create a missing volume, empty.
if ! docker --context "$CONTEXT" volume inspect "$DATA_VOLUME" >/dev/null; then
  echo "No $DATA_VOLUME volume on $CONTEXT: create it and publish a data version into it with the pipeline before the first deploy." >&2
  exit 1
fi
compose=(docker --context "$CONTEXT" compose -f "$here/docker-compose.yml")
"${compose[@]}" build
docker --context "$CONTEXT" run --rm --network none --read-only --volume "$DATA_VOLUME:/data:ro" "lcdg-og:$LCDG_TAG" node og/src/checkData.ts
"${compose[@]}" up --detach --no-build --wait --wait-timeout 300
"${compose[@]}" ps

# A first deploy waits for its Let's Encrypt certificate, and every start for the data version to load.
for _ in $(seq 60); do
  if curl -fsS "$ORIGIN/healthz" 2>/dev/null | grep -q '"data":"ready"'; then break; fi
  sleep 2
done

(cd "$root/og" && LIVE_ORIGIN=$ORIGIN npm run test:live)
echo "lcdg-og:$LCDG_TAG is live at $ORIGIN"
