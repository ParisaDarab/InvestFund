# mock-llm image (P0-MOCK-01). Build context: the repository root (see infra/docker-compose.yml).
#
#   docker build -f infra/mocks/llm/Dockerfile -t investfund/mock-llm:dev .
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
COPY infra/mocks/llm/package.json infra/mocks/llm/
RUN pnpm install --frozen-lockfile --filter @investfund/mock-llm
COPY infra/mocks/llm/ infra/mocks/llm/
RUN pnpm --filter @investfund/mock-llm run build \
 && rm -rf node_modules infra/mocks/llm/node_modules \
 && pnpm install --frozen-lockfile --prod --filter @investfund/mock-llm

FROM node:22.23.3-alpine3.24 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4010
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/infra/mocks/llm/package.json infra/mocks/llm/package.json
COPY --from=build /repo/infra/mocks/llm/node_modules infra/mocks/llm/node_modules
COPY --from=build /repo/infra/mocks/llm/dist infra/mocks/llm/dist
COPY --from=build /repo/infra/mocks/llm/fixtures infra/mocks/llm/fixtures
WORKDIR /app/infra/mocks/llm
USER node
EXPOSE 4010
CMD ["node", "dist/server.js"]
