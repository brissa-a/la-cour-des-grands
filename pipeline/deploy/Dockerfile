# syntax=docker/dockerfile:1
# Build context: the repository root, filtered by Dockerfile.dockerignore. Built and run by server/deploy/deploy.sh, in the compose project of server/.

FROM node:24.21.0-slim
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app/pipeline

ADD --chmod=755 --checksum=sha256:d2d7c97fbfefc763d5bbcbbb3f8d61f9dd3410ce5d05a737c414994b80b8cdd0 \
    https://github.com/aptible/supercronic/releases/download/v0.2.50/supercronic-linux-amd64 /usr/local/bin/supercronic

# sharp and onnxruntime-node carry their Linux x64 binaries in the packages: their install scripts only fetch what the CPU run does not use.
COPY pipeline/package.json pipeline/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund

COPY pipeline/assets assets
COPY pipeline/src src
COPY pipeline/deploy/crontab pipeline/deploy/scheduler.sh deploy/
RUN supercronic -test deploy/crontab
# A user of its own: lcdg-server (uid 10001) reads what it writes through the modes the pipeline sets, and cannot change it.
# The folders are those of the volumes, which take this ownership when first mounted empty.
RUN groupadd --gid 10002 pipeline \
 && useradd --uid 10002 --gid pipeline --no-create-home --home-dir /tmp --shell /usr/sbin/nologin pipeline \
 && install -d -o pipeline -g pipeline -m 0755 cache output output/photos /data

USER pipeline
ENV HOME=/tmp \
    LCDG_DATA_ROOT=/data
CMD ["deploy/scheduler.sh"]
