# P0-TEST-01: Test tooling, coverage thresholds and test utilities
Owner: tester        Estimate: M
Requirements: NFR-MAINT-01, NFR-A11Y-01, NFR-PERF-01 (tooling)
Depends on: P0-REPO-01, P0-API-01, P0-DB-01, P0-WEB-01

## Goal
A complete, consistent test toolchain across the monorepo so that every later card can meet the Definition of Done: unit, integration with real Postgres and Redis, component tests with MSW, E2E with accessibility checks, and enforced coverage thresholds.

## Scope
- In: per-package Vitest configs (API: node environment, `*.test.ts` unit and `*.int.test.ts` integration projects; web: jsdom + Testing Library; shared); coverage with v8 and thresholds (API `src/modules/**` and `src/core/**` ≥ 80% lines and branches; web ≥ 70%); `packages/test-utils` (`@faker-js/faker` with locale `en_GB` and a fixed seed; factory pattern base; Testcontainers helpers for Postgres (from P0-DB-01) and Redis; a `signTestToken({ id, role })` helper using the test JWT secret; `createTestApp()` wrapper); Playwright config in `apps/web` (projects: chromium desktop, mobile viewport; `baseURL` from env; trace on first retry) with `@axe-core/playwright` helper `expectNoA11yViolations(page)` (serious and critical); first smoke specs (landing page renders in both themes, API health); scripts `test`, `test:unit`, `test:int`, `test:e2e`, `test:coverage`; `docs/test-reports/TEMPLATE.md`.
- Out: CI workflow (P0-CI-01); k6 and Lighthouse CI scripts beyond a placeholder (later phases).

## Contracts / inputs
- Endpoints: `GET /health/ready`
- Schemas: `HealthReport`
- Tables: none

## Acceptance criteria
1. Given the repo, When `pnpm test:unit` runs, Then all packages' unit tests run in parallel and finish without needing Docker.
2. Given Docker, When `pnpm test:int` runs, Then API integration tests run against Testcontainers Postgres (pgvector) and Redis, and containers are removed afterwards.
3. Given API module coverage below 80%, When `pnpm test:coverage` runs, Then it exits non-zero and names the failing threshold.
4. Given `faker` from `@investfund/test-utils`, When two runs generate a founder, Then the generated data is identical (fixed seed) and uses UK formats (postcodes, phone numbers).
5. Given the running dev stack, When `pnpm --filter web test:e2e` runs, Then the smoke specs pass and the axe helper reports no serious or critical violations.
6. Given a test report template, When a phase report is created from it, Then it contains sections for suites, coverage numbers, budgets, invariants and open defects.

## Test requirements
- Unit: factories (seeded determinism); token helper.
- Integration: one sample integration test proving container isolation.
- E2E / non-functional: the smoke specs themselves.

## Notes / risks
- Testcontainers on Windows requires Docker Desktop; document a `TESTCONTAINERS_RYUK_DISABLED` fallback only if needed and justified.
