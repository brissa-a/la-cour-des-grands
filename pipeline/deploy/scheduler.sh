#!/bin/sh
# The container's command: no scheduler, so no run, without a token ntfy accepts and a data root to write.
set -eu
node src/scheduled/main.ts check
exec supercronic -passthrough-logs deploy/crontab
