# P0-DB-01: Prisma initialisation and database access foundation
Owner: backend        Estimate: S
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
