# P0-TEST-02: Sandbox smoke test and Phase 0 test report
Owner: tester        Estimate: S
Requirements: NFR-OBS-01, NFR-MAINT-01, NFR-SEC-01 (sandbox isolation)
Depends on: P0-REPO-01, P0-SHARED-01, P0-INFRA-01, P0-API-01, P0-API-02, P0-API-03, P0-DB-01, P0-MOCK-01, P0-MOCK-02, P0-WEB-01, P0-WEB-02, P0-WEB-03, P0-WEB-04, P0-TEST-01, P0-CI-01

## Goal
Prove that the whole Phase 0 foundation works together in the sandbox and run the Phase 0 demo script end to end, producing the evidence for Gate D.

## Scope
- In: `infra/sim/scenarios/p0-smoke.ts` that brings up (or expects) the sandbox profile and checks: API `/health/ready` (db, redis, storage), worker processes a `noop` job, mock-llm completion and embedding through the API's configured base URL, mock-google `/health`, Mailpit API reachable, web landing page 200 in both themes, no egress from app containers; `pnpm sim:p0`; `docs/test-reports/phase-0.md` with suite results, coverage, start-up times, CI run links, the demo-script transcript and open defects.
- Out: feature scenarios (later phases).

## Contracts / inputs
- Endpoints: `GET /health/live`, `GET /health/ready`, mock-llm `/v1/*`, mock-google `/health`, Mailpit API
- Schemas: `HealthReport`
- Tables: none

## Acceptance criteria
1. Given a clean machine with Docker, When the README's commands are followed, Then `pnpm sim:p0` passes every check listed in Scope.
2. Given the sandbox profile, When the egress check runs from the `api` container, Then outbound internet access fails and the check passes.
3. Given the Phase 0 demo script in `docs/PHASE_PLAN.md`, When executed, Then each step's outcome is recorded in `docs/test-reports/phase-0.md`.
4. Given all P0 suites, When the report is written, Then it states PASS or FAIL per suite with coverage numbers and links to the CI run.

## Test requirements
- Unit: none.
- Integration: the scenario script itself.
- E2E / non-functional: start-up time and health latency recorded.

## Notes / risks
- If any check fails, report FAIL with the evidence; do not mark the phase ready for Gate D.
