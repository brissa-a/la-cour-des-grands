# syntax=docker/dockerfile:1
# Build context: the repository root, filtered by Dockerfile.dockerignore. deploy.sh builds web/dist beforehand.

FROM node:24.21.0-slim
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

COPY og/package.json og/package-lock.json og/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefix og --omit=dev --ignore-scripts --no-audit --no-fund \
 && node og/node_modules/playwright-core/cli.js install --with-deps --only-shell chromium \
 && rm -rf /var/lib/apt/lists/*

# The service imports the front's shared code from web/src, which reads CSV with papaparse.
COPY web/package.json web/package-lock.json web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefix web --omit=dev --ignore-scripts --no-audit --no-fund

COPY web/src web/src
COPY web/dist web/dist
COPY og/src og/src
RUN install -d -o node -g node og/cache

USER node
ENV HOME=/tmp
EXPOSE 8080
CMD ["node", "og/src/main.ts"]
