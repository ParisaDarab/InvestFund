# Phase 0: Foundations, task cards

Phase plan: [`docs/PHASE_PLAN.md`](../../PHASE_PLAN.md#r0-foundations-lean-finish) · Branch: `feature/p0-foundations` · Status values: `todo → in-progress → in-review → approved → committed`

> **Re-scoped 2026-10-09 (Gate A approved).** Phase 0 is now release **R0** in the session-sized plan (`docs/PHASE_PLAN.md` §3). R0 sessions: S0.1 stabilise and commit · S0.2 DB-01 · S0.3 API-02 (trimmed, Postgres-backed rate limiter, no Redis) · S0.4 CI-01 · S0.5 WEB-04. Cards marked `deferred` move to the release that first needs them. The previous plan is archived at `docs/archive/PHASE_PLAN_v1.md`.

| ID | Title | Owner | Estimate | Depends on | Status | Commit |
|---|---|---|---|---|---|---|
| [P0-REPO-01](P0-REPO-01-monorepo-tooling.md) | Monorepo, TypeScript and lint tooling | backend | M | none | committed | |
| [P0-SHARED-01](P0-SHARED-01-shared-package.md) | Shared contracts package and OpenAPI generator | backend | M | REPO-01 | committed | |
| [P0-INFRA-01](P0-INFRA-01-docker-compose.md) | Docker Compose infrastructure | backend | M | REPO-01 | committed | |
| [P0-API-01](P0-API-01-express-skeleton.md) | Express skeleton, config, logging, errors, health | backend | M | REPO-01, SHARED-01 | committed | 03502b5 |
| [P0-API-02](P0-API-02-core-security.md) | Core security, rate limits, crypto, storage, auth guards | backend | M | API-01, DB-01 | committed | 6d1c5a4 |
| [P0-API-03](P0-API-03-worker-queues.md) | Worker entry point and BullMQ foundation | backend | S | API-01, INFRA-01 | deferred (R2) | |
| [P0-DB-01](P0-DB-01-prisma-init.md) | Prisma initialisation and DB access foundation | backend | S | API-01, INFRA-01 | committed | fc8fbfe |
| [P0-MOCK-01](P0-MOCK-01-mock-llm.md) | Mock LLM server skeleton | tester | M | REPO-01, INFRA-01 | committed (parked until R2) | 48aa157 |
| [P0-MOCK-02](P0-MOCK-02-mock-google.md) | Mock Google server skeleton | tester | M | REPO-01, INFRA-01 | committed (parked until R5) | 48aa157 |
| [P0-WEB-01](P0-WEB-01-nextjs-skeleton.md) | Next.js skeleton with i18n, theming, providers | frontend | M | REPO-01 | committed | |
| [P0-WEB-02](P0-WEB-02-design-tokens.md) | Design tokens, theme and base UI primitives | frontend | M | WEB-01 | committed | 06941de |
| [P0-WEB-03](P0-WEB-03-marketing-shell.md) | Marketing layout shell | frontend | M | WEB-02 | deferred (R1 S1.10) | |
| [P0-WEB-04](P0-WEB-04-api-client.md) | Typed API client and MSW setup | frontend | S | WEB-01, SHARED-01, API-01 | todo | |
| [P0-TEST-01](P0-TEST-01-test-tooling.md) | Test tooling, coverage thresholds, test utilities | tester | M | REPO-01, API-01, DB-01, WEB-01 | partial (Playwright → R1 S1.11) | |
| [P0-CI-01](P0-CI-01-github-actions.md) | GitHub Actions CI pipeline (**Gate X**) | tester | M | TEST-01, INFRA-01 | in-review (coverage → TEST-01, e2e-smoke → R1 S1.11) | |
| [P0-TEST-02](P0-TEST-02-sandbox-smoke.md) | Sandbox smoke test and Phase 0 report | tester | S | all other P0 cards | deferred (R2) | |

Totals: 16 cards. Backend 7 (5 M, 2 S) · Frontend 4 (3 M, 1 S) · Tester 5 (4 M, 1 S).

## Original execution order (superseded by the R0 sessions above)

| Wave | Backend | Frontend | Tester |
|---|---|---|---|
| 1 | REPO-01 | | |
| 2 | SHARED-01, INFRA-01 | WEB-01 | |
| 3 | API-01 | WEB-02 | MOCK-01, MOCK-02 |
| 4 | API-02, API-03, DB-01 | WEB-03, WEB-04 | |
| 5 | | | TEST-01 |
| 6 | | | CI-01 (Gate X) |
| 7 | | | TEST-02 → Gate D |

Contract-first note: Phase 0 has no domain features. P0-SHARED-01 is the contract card (common schemas and `HealthReport`) and must pass supervisor review before P0-API-01 and P0-WEB-04 start.

Every card ships with its own unit and integration tests using the root Vitest workspace from P0-REPO-01. P0-TEST-01 then adds coverage enforcement, Testcontainers helpers and Playwright, and the earlier cards' tests must still pass afterwards.
