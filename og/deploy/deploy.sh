#!/usr/bin/env bash
# Builds the front here, then builds and (re)starts the preview service on the Dedibox, then checks it from outside.
#   og/deploy/deploy.sh
# Roll back to an earlier image:  LCDG_TAG=<tag> docker --context abysshopper compose -f og/deploy/docker-compose.yml up -d --no-build
# Remove the service:             docker --context abysshopper compose -f og/deploy/docker-compose.yml down
set -euo pipefail

readonly CONTEXT=abysshopper

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)
readonly here root

tag=$(git -C "$root" rev-parse --short=12 HEAD)
if [[ -n $(git -C "$root" status --porcelain -- og web) ]]; then tag="$tag-dirty"; fi
export LCDG_TAG=$tag

(cd "$root/web" && npm ci --no-audit --no-fund && npm run build)

docker --context "$CONTEXT" network inspect edge >/dev/null
compose=(docker --context "$CONTEXT" compose -f "$here/docker-compose.yml")
"${compose[@]}" up --detach --build --wait --wait-timeout 300
"${compose[@]}" ps

(cd "$root/og" && npm run test:live)
echo "lcdg-og:$LCDG_TAG is live at https://lcdg.kxv.fr"
