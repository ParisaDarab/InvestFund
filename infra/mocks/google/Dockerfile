# mock-google image (P0-MOCK-02). Build context: the repository root (see infra/docker-compose.yml).
#
#   docker build -f infra/mocks/google/Dockerfile -t investfund/mock-google:dev .
#
# Only this package's manifest is copied, and pnpm installs it from the workspace lockfile
# (--frozen-lockfile), so the image gets exactly the locked versions. The base image is pinned to
# an exact tag (Gate X H3); infra/scripts/check-compose.mjs rejects unpinned FROM lines, so keep
# both FROM lines literal.

FROM node:22.23.3-alpine3.24 AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY infra/mocks/google/package.json infra/mocks/google/
RUN pnpm install --frozen-lockfile --filter @investfund/mock-google
COPY infra/mocks/google/ infra/mocks/google/
RUN pnpm --filter @investfund/mock-google run build \
 && rm -rf node_modules infra/mocks/google/node_modules \
 && pnpm install --frozen-lockfile --prod --filter @investfund/mock-google

FROM node:22.23.3-alpine3.24 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4020
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/infra/mocks/google/package.json infra/mocks/google/package.json
COPY --from=build /repo/infra/mocks/google/node_modules infra/mocks/google/node_modules
COPY --from=build /repo/infra/mocks/google/dist infra/mocks/google/dist
WORKDIR /app/infra/mocks/google
USER node
EXPOSE 4020
CMD ["node", "dist/server.js"]
