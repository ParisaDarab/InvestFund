# API image (P0-API-01), also used by the worker service. Build context: the repository root.
#
#   docker build -f apps/api/Dockerfile -t investfund/api:sandbox .
#
# Only the manifests of the api and its workspace dependency (@investfund/shared) are copied before
# the install, and pnpm installs from the workspace lockfile (--frozen-lockfile). Keep both FROM lines
# literal and pinned (infra/scripts/check-compose.mjs rejects unpinned FROM lines).

FROM node:22.23.3-alpine3.24 AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @investfund/api...
COPY apps/api/ apps/api/
RUN pnpm --filter @investfund/shared run build \
 && pnpm --filter @investfund/api run build \
 && rm -rf node_modules packages/shared/node_modules apps/api/node_modules \
 && pnpm install --frozen-lockfile --prod --ignore-scripts --filter @investfund/api...

FROM node:22.23.3-alpine3.24 AS runtime
# API_HOST=0.0.0.0 inside the container only; compose never publishes the api or metrics ports.
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4000 METRICS_HOST=0.0.0.0 METRICS_PORT=9464
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
