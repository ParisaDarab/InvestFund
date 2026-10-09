# P0-DB-01: Prisma initialisation and database access foundation
Owner: backend        Estimate: S        Status: in-review
Requirements: NFR-MAINT-01, NFR-SEC-01 (parameterised queries)
Depends on: P0-API-01, P0-INFRA-01

## Goal
Set up Prisma and the conventions from `docs/DATABASE.md` so that P1 can add the first tables with a normal migration, and so that integration tests get an isolated real PostgreSQL with pgvector.

## Scope
- In: `apps/api/prisma/schema.prisma` (PostgreSQL datasource, generator, `previewFeatures` only if required for extensions; no domain models); first migration `init_extensions` (`CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS citext;`); `core/db` (PrismaClient singleton with query logging at debug level without parameters, `$transaction` helper for Unit of Work); UUID v7 generator in `core/ids` (decision D5); db readiness check registered with the health registry; `packages/test-utils/src/db.ts` (Testcontainers `pgvector/pgvector` PG 16 start, apply migrations, per-suite schema or truncate helper); `infra/seed/` skeleton with `pnpm seed` (no data yet); scripts `db:migrate`, `db:generate`, `db:studio`.
- Out: any domain table (P1 onwards); vector columns (P4).

## Contracts / inputs
- Endpoints: `GET /health/ready` (db check)
- Schemas: none
- Tables: none (extensions only)

## Acceptance criteria
1. Given a fresh database, When `pnpm --filter api prisma migrate dev` runs, Then `init_extensions` applies and `vector` and `citext` exist.
2. Given the API with the database stopped, When `GET /health/ready` is called, Then it returns 503 with the `db` check failing; with the database up, Then 200.
3. Given the Testcontainers helper, When two integration suites run in parallel, Then each has an isolated schema and neither sees the other's data.
4. Given `newId()` called 1 000 times, When compared, Then all IDs are valid UUID v7 and sort in creation order.
5. Given the lint rule from P0-REPO-01, When code calls `$queryRawUnsafe`, Then lint fails (verified by a fixture).

## Test requirements
- Unit: UUID v7 generator (format, monotonic order).
- Integration: migration on Testcontainers; readiness check up and down.
- E2E / non-functional: Testcontainers start-up time recorded (CI budget).

## Notes / risks
- Testcontainers on Windows needs Docker Desktop; CI runs on Linux.
- Pin the Prisma version; confirm whether it can generate UUID v7 natively, otherwise keep the app-side generator.

## Implementation notes (2026-10-09, in-review)

**Versions.** `prisma` 6.19.3 (dev) and `@prisma/client` 6.19.3, pinned exactly. Prisma 7.x was not used: its client requires a driver adapter (`@prisma/adapter-pg` + `pg`), which are not on the approved dependency list. Moving to Prisma 7 later needs those two packages approved and the client factory switched to the adapter. `pnpm-workspace.yaml` `allowBuilds` now allows `prisma`, `@prisma/engines` and `@prisma/client` install scripts (engine download).

**Layout.** `apps/api/prisma/schema.prisma` (`prisma-client-js`, output `apps/api/generated/prisma`, gitignored, `binaryTargets` native + `linux-musl-openssl-3.0.x` for the Alpine image), `apps/api/prisma.config.ts` (loads the root `.env` when present; existing env vars win), migration `20261009000000_init_extensions` + `migration_lock.toml`. The api `postinstall` runs `prisma generate`; `build` also generates. Scripts: `db:generate`, `db:migrate` (`prisma migrate dev`), `db:studio`, `seed` in `apps/api`, forwarded from the root. `apps/api/Dockerfile` copies the schema before install and ships `generated/` next to `dist/` (not built locally: Docker Hub is rate-limited in this environment).

**Config.** `DATABASE_URL` is required (`postgresql://` or `postgres://`), exposed as `config.database.url`.

**core/db.** `createPrismaClient` (lazy connect; at `debug` logs SQL text and duration, never `params`; `errorFormat: 'minimal'`; warn/error events logged without messages that could carry values), `createUnitOfWork` (`$transaction` interactive transactions with isolation level / timeouts), `createDbReadinessCheck` (`SELECT 1`, bounded by the registry's 2 s timeout). The container owns one client, registers `db` with the readiness registry and adds a `$disconnect` close hook (run by graceful shutdown). Redis is not part of readiness.

**UUID v7 (D5).** `core/ids/newId()` is implemented in-house with `node:crypto` (RFC 9562 §6.2 method 1: 42-bit counter seeded with 41 random bits per millisecond, monotonic within the same ms, clock-regression safe, timestamp advance on overflow). Prisma 6 can generate v7 natively (`@default(uuid(7))`), but only for writes through Prisma Client and with no documented monotonic guarantee, so the app-side generator stays the source of IDs; `@default(uuid(7))` may be added as a fallback default on models.

**Test databases (deviation).** Testcontainers is not used yet: it is not an approved dependency and Docker Hub pulls are rate-limited here. `packages/test-utils/src/db.ts` `createTestDatabase({ prismaProjectDir })` creates a uniquely named **database** (not a schema, so each suite gets its own `vector`/`citext` and the extensions resolve without `search_path` tricks) on the server named by `TEST_DATABASE_URL` → `DATABASE_URL` → local compose default, runs `prisma migrate deploy`, and `drop()` removes it (`DROP DATABASE ... WITH (FORCE)`). SQL runs through the api's Prisma CLI, URLs go through the environment (never argv) and are scrubbed from errors. The server source is behind `TestDatabaseServer` (`existingServer()` today) so a Testcontainers `pgvector/pgvector` PG 16 starter can be slotted in later without changing callers.

**Deferred.** Testcontainers start-up time recording (CI budget) → P0-TEST-01 / P0-CI-01. CI needs a Postgres service (pgvector image) with `TEST_DATABASE_URL` set.

**Lint (AC5).** The ban from P0-REPO-01 was already in `eslint.config.mjs`; `apps/api/src/core/db/__tests__/raw-unsafe-lint.test.ts` lints the fixture `apps/api/test/fixtures/lint/raw-unsafe.ts` with the real repository config and expects errors on the three unsafe calls (fixtures are excluded from `pnpm lint`).

**Seed.** `infra/seed/seed.ts` validates config (it reuses the API's `loadConfig`, so `JWT_ACCESS_SECRET` must also be set), checks the database is reachable and exits. Typechecked through the api tsconfig; `infra/seed/tsconfig.json` serves ESLint.

**Tests.** Unit: UUID v7 (11), config (+3), db readiness / Unit of Work with mocks, container wiring. Integration (real PostgreSQL): `/health/ready` up (200) and down (503, `db` fail, no details leaked, < 5 s); parallel per-suite databases isolated, `init_extensions` applied, drop on teardown; query log without parameters; Unit of Work commit and rollback. The existing API-01 readiness tests now use an isolated registry with fake checks.
