# @investfund/api

Express 5 + TypeScript REST API for InvestFund: a modular monolith with layered domain modules.
Contracts (Zod schemas, problem types, the OpenAPI generator) come from `@investfund/shared`.

## Commands

| Task                                       | Command                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| Dev (watch, loads `../../.env` if present) | `pnpm --filter @investfund/api dev`                  |
| Build to `dist/`                           | `pnpm --filter @investfund/api build`                |
| Start the build                            | `pnpm --filter @investfund/api start`                |
| Typecheck                                  | `pnpm --filter @investfund/api typecheck`            |
| Tests                                      | `pnpm vitest run --project api` (from the repo root) |
| Generate Prisma Client (also on install)   | `pnpm db:generate`                                   |
| Create/apply migrations (dev)              | `pnpm db:migrate` (`prisma migrate dev`)             |
| Prisma Studio                              | `pnpm db:studio`                                     |
| Seed (`infra/seed/seed.ts`)                | `pnpm seed`                                          |

## Layout

```
src/
  app.ts            createApp(deps): the Express app, free of side effects (used by tests)
  server.ts         HTTP entry: config → container → listen; graceful shutdown on SIGTERM/SIGINT
  core/
    config/         Zod-validated env (the only place that reads process.env)
    container.ts    composition root: builds infrastructure and modules, wires dependencies
    db/             Prisma client factory (debug query log without params), Unit of Work, db readiness check
    errors/         DomainError classes, problem+json builder, central error handler
    health/         readiness check registry, /health/live and /health/ready
    ids/            newId(): UUID v7, monotonic within the process (decision D5)
    http/           asyncHandler, 404 fallback, server start/graceful shutdown
    logger/         pino logger (redaction), pino-http request logging and request IDs
    metrics/        prom-client registry, HTTP duration histogram, internal metrics app
    openapi/        GET /api/v1/openapi.json
  modules/<domain>/ domain modules (from Phase 1)
prisma/             schema.prisma and migrations (first: init_extensions → vector, citext)
prisma.config.ts    Prisma CLI config (loads the root .env when present)
generated/prisma/   Prisma Client from `prisma generate` (gitignored)
```

## Database

Prisma 6 (`prisma-client-js`, classic engine) on PostgreSQL 16 with `vector` and `citext`.
The container creates one `PrismaClient` per process (lazy connect), registers the `db` readiness
check and disconnects it on shutdown. Repositories receive the client or a transaction client from
`UnitOfWork.run`. IDs come from `newId()` in `core/ids`. Raw SQL only through the tagged templates
`$queryRaw` / `$executeRaw`; `$queryRawUnsafe` and `$executeRawUnsafe` fail lint.

Integration tests get an isolated database from `@investfund/test-utils/db`
(`createTestDatabase({ prismaProjectDir })`): a uniquely named database on the server named by
`TEST_DATABASE_URL` (else `DATABASE_URL`, else the local compose database), migrated with
`prisma migrate deploy` and dropped by `drop()`. The role needs `CREATEDB` and permission to create
the extensions.

## Domain module convention

Each domain lives in `src/modules/<domain>/` and is layered. Dependencies point downwards only,
and each layer depends on interfaces, not concrete classes:

```
<domain>.routes.ts       Express router: wiring only (path, guards, validation, controller method)
<domain>.controller.ts   HTTP ↔ DTO mapping; parses input and output with the shared Zod schemas
<domain>.service.ts      business rules, ownership and visibility checks; throws DomainErrors
<domain>.repository.ts   Prisma data access only (Repository pattern)
<domain>.types.ts        domain types, repository and service interfaces
__tests__/               *.test.ts (unit, mocked dependencies), *.int.test.ts (Supertest)
```

routes → controller → service → repository. The composition root (`core/container.ts`) builds
each module and passes its router to `createApp` as an `ApiModule` (`{ path: '/startups', router }`),
which is mounted under `/api/v1`. See the `express-module` skill for the full procedure.

## Errors

Throw a typed error from `core/errors` (`ValidationError`, `NotFoundError`, `ForbiddenError`,
`ConflictError`, `BusinessRuleError`, `RateLimitError`, `DependencyUnavailableError`). The central
handler turns it into an RFC 9457 `application/problem+json` body (`ProblemDetails`) with the
request ID. Any other error becomes a 500 with a generic `detail`; the stack is logged, never
returned. `detail` text must be safe to show to the caller.

## Request IDs and logging

Every response carries `X-Request-Id`: the incoming header when it is well formed
(`[A-Za-z0-9._:-]{1,128}`), otherwise a generated UUID. Each request produces one JSON log line
with `req.id`, method, path (no query string) and status. Use `req.log` inside handlers so lines
carry the request. Values under `authorization`, `cookie`, `set-cookie`, `password`, `token`,
`accessToken`, `refreshToken`, `apiKey` and `secret` are redacted up to three levels deep.
Never log document text, tokens or personal data.

## Health, metrics and OpenAPI

| Endpoint                   | Where                                                                              | Notes                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`         | public app                                                                         | `200 { "status": "ok" }`                                                                                                                                          |
| `GET /health/ready`        | public app                                                                         | `200`/`503` `HealthReport`; the container registers `db` (`SELECT 1`), later cards add their own; each check times out after 2 s                                  |
| `GET /metrics`             | **internal listener only** (`METRICS_HOST:METRICS_PORT`, default `127.0.0.1:9464`) | prom-client defaults + `http_request_duration_seconds{method,route,status_code}`. Never publish or route this port publicly; disable with `METRICS_ENABLED=false` |
| `GET /api/v1/openapi.json` | public app                                                                         | served when `OPENAPI_PUBLIC` is true (default: on outside production)                                                                                             |

## Configuration

| Variable                                            | Default                       | Notes                                                        |
| --------------------------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                                          | `development`                 | `development`, `test` or `production`                        |
| `API_HOST` / `API_PORT`                             | `127.0.0.1` / `4000`          | the Docker image sets `API_HOST=0.0.0.0`                     |
| `LOG_LEVEL`                                         | `info` (`silent` in test)     | pino level                                                   |
| `METRICS_ENABLED` / `METRICS_HOST` / `METRICS_PORT` | `true` / `127.0.0.1` / `9464` | internal metrics listener                                    |
| `OPENAPI_PUBLIC`                                    | `true` outside production     | admin-only in production comes with the auth guard           |
| `SHUTDOWN_TIMEOUT_MS`                               | `8000`                        | drain time for in-flight requests before connections are cut |
| `DATABASE_URL`                                      | required                      | `postgresql://` or `postgres://` URL (contains a secret)     |
| `JWT_ACCESS_SECRET`                                 | required                      | at least 32 characters and not a placeholder in production   |

Startup fails fast with exit code 1 and lists the invalid variable **names** (never values).
