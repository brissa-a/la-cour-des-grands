#!/usr/bin/env bash
# Builds the front here, then builds and (re)starts the preview service on the Dedibox, then checks it from outside.
#   og/deploy/deploy.sh
# Roll back to an earlier image:  LCDG_TAG=<tag> docker --context abysshopper compose -f og/deploy/docker-compose.yml up -d --no-build
# Remove the service:             docker --context abysshopper compose -f og/deploy/docker-compose.yml down
set -euo pipefail

readonly CONTEXT=abysshopper
readonly ORIGIN=https://lcdg.kxv.fr

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

# A first deploy waits for its Let's Encrypt certificate, and every start for the data version to load.
for _ in $(seq 60); do
  if curl -fsS "$ORIGIN/healthz" 2>/dev/null | grep -q '"data":"ready"'; then break; fi
  sleep 2
done

(cd "$root/og" && LIVE_ORIGIN=$ORIGIN npm run test:live)
echo "lcdg-og:$LCDG_TAG is live at $ORIGIN"
