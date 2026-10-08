# Phase 0: Foundations, task cards

Phase plan: [`docs/PHASE_PLAN.md`](../../PHASE_PLAN.md#phase-0-foundations) · Branch: `feature/p0-foundations` · Status values: `todo → in-progress → in-review → approved → committed`

**Before any card starts:** Gate A approval of this plan, and Gate X approval of the P0 dependency list (`PHASE_PLAN.md` §6, decision D3).

| ID | Title | Owner | Estimate | Depends on | Status | Commit |
|---|---|---|---|---|---|---|
| [P0-REPO-01](P0-REPO-01-monorepo-tooling.md) | Monorepo, TypeScript and lint tooling | backend | M | none | committed | |
| [P0-SHARED-01](P0-SHARED-01-shared-package.md) | Shared contracts package and OpenAPI generator | backend | M | REPO-01 | todo | |
| [P0-INFRA-01](P0-INFRA-01-docker-compose.md) | Docker Compose infrastructure | backend | M | REPO-01 | todo | |
| [P0-API-01](P0-API-01-express-skeleton.md) | Express skeleton, config, logging, errors, health | backend | M | REPO-01, SHARED-01 | todo | |
| [P0-API-02](P0-API-02-core-security.md) | Core security, rate limits, crypto, storage, auth guards | backend | M | API-01 | todo | |
| [P0-API-03](P0-API-03-worker-queues.md) | Worker entry point and BullMQ foundation | backend | S | API-01, INFRA-01 | todo | |
| [P0-DB-01](P0-DB-01-prisma-init.md) | Prisma initialisation and DB access foundation | backend | S | API-01, INFRA-01 | todo | |
| [P0-MOCK-01](P0-MOCK-01-mock-llm.md) | Mock LLM server skeleton | tester | M | REPO-01, INFRA-01 | todo | |
| [P0-MOCK-02](P0-MOCK-02-mock-google.md) | Mock Google server skeleton | tester | M | REPO-01, INFRA-01 | todo | |
| [P0-WEB-01](P0-WEB-01-nextjs-skeleton.md) | Next.js skeleton with i18n, theming, providers | frontend | M | REPO-01 | todo | |
| [P0-WEB-02](P0-WEB-02-design-tokens.md) | Design tokens, theme and base UI primitives | frontend | M | WEB-01 | todo | |
| [P0-WEB-03](P0-WEB-03-marketing-shell.md) | Marketing layout shell | frontend | M | WEB-02 | todo | |
| [P0-WEB-04](P0-WEB-04-api-client.md) | Typed API client and MSW setup | frontend | S | WEB-01, SHARED-01, API-01 | todo | |
| [P0-TEST-01](P0-TEST-01-test-tooling.md) | Test tooling, coverage thresholds, test utilities | tester | M | REPO-01, API-01, DB-01, WEB-01 | todo | |
| [P0-CI-01](P0-CI-01-github-actions.md) | GitHub Actions CI pipeline (**Gate X**) | tester | M | TEST-01, INFRA-01 | todo | |
| [P0-TEST-02](P0-TEST-02-sandbox-smoke.md) | Sandbox smoke test and Phase 0 report | tester | S | all other P0 cards | todo | |

Totals: 16 cards. Backend 7 (5 M, 2 S) · Frontend 4 (3 M, 1 S) · Tester 5 (4 M, 1 S).

## Execution order (cards in the same wave can run in parallel)

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
