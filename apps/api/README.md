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
    auth/           AuthGuards: requireAuth(), requireRole(...roles) (HS256 JWT via jose, req.user)
    config/         Zod-validated env (the only place that reads process.env)
    container.ts    composition root: builds infrastructure and modules, wires dependencies
    crypto/         AES-256-GCM cipher with a versioned key ring, hashToken (SHA-256), hmacIp
    db/             Prisma client factory (debug query log without params), Unit of Work, db readiness check
    errors/         DomainError classes, problem+json builder, central error handler
    file-storage/   StorageProvider interface, LocalDiskStorageProvider, storage readiness check
    health/         readiness check registry, /health/live and /health/ready
    ids/            newId(): UUID v7, monotonic within the process (decision D5)
    http/           asyncHandler, 404 fallback, server start/graceful shutdown
    logger/         pino logger (redaction), pino-http request logging and request IDs
    metrics/        prom-client registry, HTTP duration histogram, internal metrics app
    openapi/        GET /api/v1/openapi.json (public or admin-only)
    rateLimit/      presets (docs/API.md §3), Postgres and in-memory counter stores, middleware
    security/       helmet headers (strict API CSP, HSTS in production), CORS allowlist
    validation/     validate({ body, query, params }) with the shared Zod schemas
  modules/<domain>/ domain modules (from Phase 1)
prisma/             schema.prisma and migrations (init_extensions → vector, citext; rate_limit_buckets)
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

## Security building blocks (P0-API-02)

Every request passes through, in order: request ID and logging → metrics → security headers →
CORS → JSON body parser (1 MB; larger bodies get `413 payload-too-large`) → routes. Routes then
declare their guard, rate limit and validation:

```ts
router.post(
  '/',
  authGuards.requireRole('founder'), // 401 unauthenticated / 403 forbidden
  rateLimiter.limit('default'), // after the guard, so it counts per user
  validate({ body: CreateStartupRequest }), // 400 validation-error with errors[]
  controller.create,
);
```

- **Headers** (helmet): `Content-Security-Policy: default-src 'none'; base-uri 'none';
form-action 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy:
same-origin`, and `Strict-Transport-Security` (1 year, subdomains) in production only.
  No `X-Powered-By`.
- **CORS**: exact allowlist, the `WEB_URL` origin only, with credentials. Other origins get no
  `Access-Control-*` headers. Preflights end with `204`.
- **Auth guards**: `Authorization: Bearer <jwt>`, HS256 only, `iss=investfund-api`,
  `aud=investfund`, `exp` required (5 s clock skew), claims `{ sub: UUID, role }`. They set
  `req.user = { id, role }`. `requireRole` authenticates by itself. Tokens are issued in P1.
- **Rate limits**: fixed one-minute windows per preset (`auth` 10 per IP, `upload` 20, `ai` 10,
  `sensitive` 10, `default` 120 per user or 60 per IP), with `RateLimit-Limit/Remaining/Reset/Policy`
  headers and 429 `rate-limited` plus `Retry-After`. Keys are HMACs of `ip:<addr>` or `user:<id>`.
  The store is the Postgres table `rate_limit_buckets` (one atomic upsert per hit; expired rows
  swept every 1000 hits). It **fails closed**: if the store is unreachable the request gets 503
  `dependency-unavailable`. Not yet covered: `auth` 5/min per email (P1), `upload` 500 MB/hour (S1.5).
- **Validation**: `validate()` parses with the shared schemas, replaces `req.body`, `req.query` and
  `req.params` with the parsed values and rejects unknown fields (top-level objects are made strict).
- **Crypto**: `cipher.encrypt(plain) → { ciphertext: iv‖ct‖tag, keyVersion }` and
  `cipher.decrypt(ciphertext, keyVersion)`. New data uses the current key; previous keys only
  decrypt. `hashToken` (SHA-256 hex) and `hmacIp` (HMAC-SHA256 hex under `IP_HASH_SECRET`).
- **File storage**: `storage.put(stream) → { key, sizeBytes }`, `get`, `delete`, `exists`. Keys are
  generated (`<shard>/<uuid v7>`) and validated, so traversal is impossible. Uploads stream to a
  `.tmp` file and are aborted with `413 payload-too-large` past `MAX_UPLOAD_MB`, leaving nothing
  behind. The `storage` readiness check verifies that the root is writable.

The module directory is `core/file-storage/` rather than `core/storage/`: the project permission
rule `Read(./storage/**)` (meant for uploaded files) also matches source folders named `storage`.

## Errors

Throw a typed error from `core/errors` (`ValidationError`, `NotFoundError`, `ForbiddenError`,
`ConflictError`, `BusinessRuleError`, `RateLimitError`, `DependencyUnavailableError`,
`UnauthenticatedError`, `PayloadTooLargeError`). The central
handler turns it into an RFC 9457 `application/problem+json` body (`ProblemDetails`) with the
request ID. Any other error becomes a 500 with a generic `detail`; the stack is logged, never
returned. `detail` text must be safe to show to the caller.

## Request IDs and logging

Every response carries `X-Request-Id`: the incoming header when it is well formed
(`[A-Za-z0-9._:-]{1,128}`), otherwise a generated UUID. Each request produces one JSON log line
with `req.id`, method, path (no query string) and status. Use `req.log` inside handlers so lines
carry the request. Values under `authorization`, `cookie`, `set-cookie`, `password`, `token`,
`accessToken`, `refreshToken`, `apiKey`, `secret`, `plaintext`, `ciphertext` and `encryptionKey`
are redacted up to three levels deep.
Never log document text, tokens or personal data.

## Health, metrics and OpenAPI

| Endpoint                   | Where                                                                              | Notes                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`         | public app                                                                         | `200 { "status": "ok" }`                                                                                                                                          |
| `GET /health/ready`        | public app                                                                         | `200`/`503` `HealthReport`; the container registers `db` (`SELECT 1`) and `storage` (root writable); each check times out after 2 s                               |
| `GET /metrics`             | **internal listener only** (`METRICS_HOST:METRICS_PORT`, default `127.0.0.1:9464`) | prom-client defaults + `http_request_duration_seconds{method,route,status_code}`. Never publish or route this port publicly; disable with `METRICS_ENABLED=false` |
| `GET /api/v1/openapi.json` | public app                                                                         | public when `OPENAPI_PUBLIC` is true (default: on outside production), otherwise admin-only; `default` rate limit                                                 |

## Configuration

| Variable                                            | Default                       | Notes                                                                   |
| --------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `NODE_ENV`                                          | `development`                 | `development`, `test` or `production`                                   |
| `API_HOST` / `API_PORT`                             | `127.0.0.1` / `4000`          | the Docker image sets `API_HOST=0.0.0.0`                                |
| `LOG_LEVEL`                                         | `info` (`silent` in test)     | pino level                                                              |
| `METRICS_ENABLED` / `METRICS_HOST` / `METRICS_PORT` | `true` / `127.0.0.1` / `9464` | internal metrics listener                                               |
| `OPENAPI_PUBLIC`                                    | `true` outside production     | otherwise admin-only; warns at start in production                      |
| `SHUTDOWN_TIMEOUT_MS`                               | `8000`                        | drain time for in-flight requests before connections are cut            |
| `DATABASE_URL`                                      | required                      | `postgresql://` or `postgres://` URL (contains a secret)                |
| `JWT_ACCESS_SECRET`                                 | required                      | at least 32 characters and not a placeholder in production              |
| `WEB_URL`                                           | `http://localhost:3000`       | the only CORS origin (reduced to its origin); required in production    |
| `TRUST_PROXY`                                       | `false`                       | hop count, or proxy IPs/CIDRs/`loopback`; `true` is refused             |
| `ENCRYPTION_KEY`                                    | required                      | base64 of 32 bytes; the `.env.example` dev key is refused in production |
| `ENCRYPTION_KEY_VERSION`                            | `1`                           | 1-32767, stored next to each ciphertext                                 |
| `ENCRYPTION_PREVIOUS_KEYS`                          | none                          | `<version>:<base64>,...`, decryption only (rotation)                    |
| `IP_HASH_SECRET`                                    | required                      | HMAC key for IP hashes; same strength rule as `JWT_ACCESS_SECRET`       |
| `STORAGE_DIR`                                       | `./storage`                   | local-disk storage root (relative to the working directory)             |
| `MAX_UPLOAD_MB`                                     | `25`                          | 1-1024, upload size limit                                               |
| `RATE_LIMIT_STORE`                                  | `postgres`                    | `postgres`, or `memory` for tests (refused in production)               |

Startup fails fast with exit code 1 and lists the invalid variable **names** (never values).
