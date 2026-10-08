# P0-CI-01: GitHub Actions CI pipeline
Owner: tester        Estimate: M
Requirements: NFR-MAINT-01 (CI green on every PR), NFR-SEC-01 (dependency audit)
Depends on: P0-TEST-01, P0-INFRA-01

## Goal
Every push and pull request is checked automatically with the same commands developers run locally, so that "CI green" is a reliable gate for Gate C.

## Scope
- In: `.github/workflows/ci.yml` triggered on `pull_request` and on `push` to `main` and `feature/**`; least-privilege `permissions: contents: read`; concurrency group cancelling superseded runs; pinned action versions (commit SHAs); pnpm store cache; jobs: `lint` (lint, typecheck, format check, EOL check), `unit` (unit tests with coverage, uploaded as an artefact), `integration` (Testcontainers on the Ubuntu runner's Docker), `build` (all packages, OpenAPI generation and a check that the committed `openapi.json` is up to date), `e2e-smoke` (compose sandbox profile, Playwright smoke and axe, Playwright report artefact on failure), `audit` (`pnpm audit --audit-level high`, failing on high or critical); a job summary with coverage numbers; no secrets required (sandbox only).
- Out: deployment workflows; release automation; branch protection settings (the human configures them in GitHub; a checklist is provided in the PR).

## Contracts / inputs
- Endpoints: none
- Schemas: none
- Tables: none

## Acceptance criteria
1. Given a PR with a lint error, When CI runs, Then the `lint` job fails and the PR shows a red check.
2. Given a PR that lowers API module coverage below 80%, When CI runs, Then the `unit` job fails.
3. Given a PR that changes a shared schema without regenerating `openapi.json`, When CI runs, Then the `build` job fails with a message telling the author how to regenerate.
4. Given a clean PR, When CI runs, Then all jobs pass in under 15 minutes total wall-clock time.
5. Given the workflow file, When reviewed, Then every third-party action is pinned to a commit SHA, `permissions` are read-only and no secrets are referenced.
6. Given a dependency with a known high-severity advisory, When CI runs, Then the `audit` job fails.

## Test requirements
- Unit: none.
- Integration: a throwaway PR (or `act` locally, if approved) demonstrating one failing and one passing run; links recorded in the phase-0 report.
- E2E / non-functional: CI duration recorded.

## Notes / risks
- **Gate X:** CI pipeline changes need explicit human approval (CLAUDE.md §5.3). The orchestrator must request it before committing this card.
- Branch protection on `main` (required checks) is a human action in GitHub settings.
