#!/usr/bin/env bash
set -euo pipefail

BUCKET=lcdg-v2-preview
REGION=fr-par

cd "$(dirname "$0")"
npm run build

AWS_ACCESS_KEY_ID="$(scw config get access-key)"
AWS_SECRET_ACCESS_KEY="$(scw config get secret-key)"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION="$REGION"

aws s3 sync dist "s3://$BUCKET" --acl public-read --endpoint-url "https://s3.$REGION.scw.cloud"
echo "https://$BUCKET.s3-website.$REGION.scw.cloud"
