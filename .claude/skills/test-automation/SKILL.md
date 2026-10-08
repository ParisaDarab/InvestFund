---
name: test-automation
description: Tester procedure for unit and integration tests across apps/api, apps/web and packages/shared using Vitest, Supertest, Testing Library, MSW and Testcontainers, including coverage thresholds and test data factories. Use after every implementation task.
---

# Unit and integration tests

## Layout

| What | Where | Tooling |
|---|---|---|
| API service unit | `apps/api/src/modules/<d>/__tests__/<d>.service.test.ts` | Vitest, mocked repository and adapters |
| API route integration | `apps/api/src/modules/<d>/__tests__/<d>.routes.int.test.ts` | Supertest + Testcontainers Postgres + mock LLM/Google |
| Shared schemas | `packages/shared/src/**/*.test.ts` | Vitest |
| Web components | `apps/web/src/**/*.test.tsx` | Vitest + Testing Library + MSW |

## Integration test checklist (per endpoint)

- [ ] Happy path: status, body matches the shared schema, DB state
- [ ] Validation: 400 with field errors
- [ ] 401 unauthenticated; 403 wrong role; 403/404 not owner (IDOR)
- [ ] Tiered visibility: an investor without acceptance gets the teaser fields only
- [ ] Idempotency (repeated key → same result) for side-effecting POSTs
- [ ] Side effect blocked without an approved ApprovalRecord

## Data

- Factories in `packages/test-utils/factories` (founder, startup, investor, thesis, match, draft) using `@faker-js/faker` with a fixed seed and the en_GB locale.
- Each integration suite runs in a fresh schema or transaction rollback.
- Fake timers for time-based logic (follow-ups, token expiry).

## Matching engine

Golden tests: a fixed set of synthetic startups and investors with expected top-k results and the score components. A regression larger than the threshold fails.

## Coverage

`vitest --coverage` (v8). Thresholds: API modules 80% lines/branches, web 70%. Report the numbers in the test report.
