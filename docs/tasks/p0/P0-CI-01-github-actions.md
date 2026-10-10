# P0-CI-01: GitHub Actions CI pipeline
Owner: tester        Estimate: M        Status: committed 5c90a03 (R0 S0.4, trimmed scope)
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

## Implementation (R0 S0.4, trimmed scope)

Files: `.github/workflows/ci.yml`, `.github/actions/setup/action.yml` (local composite action: pnpm from the root `packageManager` field, Node from `.nvmrc`, pnpm store cached by `actions/setup-node`, `pnpm install --frozen-lockfile`).

Triggers: `pull_request` (all branches) and `push` to `main` and `feature/**`. Top-level `permissions: contents: read`; checkout uses `persist-credentials: false`; no secrets referenced. Concurrency group `ci-<workflow>-<ref>` cancels superseded runs, except on `main` (every merge commit keeps a complete result). Runner `ubuntu-24.04`.

Pinned actions (full commit SHA; annotated tags dereferenced):

| Action | Release | SHA |
|---|---|---|
| actions/checkout | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| actions/setup-node | v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` |
| pnpm/action-setup | v6.1.0 (first release supporting pnpm 12) | `ea17c68df8912ef543352723c149a84f56e3d413` |

Jobs (also the required-check names):

| Job | Timeout | Steps |
|---|---|---|
| `lint` | 15 min | `next typegen` for apps/web, then `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm check:eol` (all four run even if an earlier one fails) |
| `test` | 20 min | service `pgvector/pgvector:0.8.7-pg16` (same image as compose, `pg_isready` health check); `prisma migrate deploy` on the fresh database; `pnpm test` (unit + integration, every Vitest project) with the GitHub Actions and JSON reporters; pass/fail table in the job summary |
| `build` | 15 min | `pnpm build`; `pnpm --filter @investfund/shared openapi:generate`; fails with an `::error` annotation and a summary telling the author to run that command if `packages/shared/openapi/` changed |
| `audit` | 5 min | `pnpm audit --audit-level high` from the lockfile (no install); advisory table in the job summary on failure |

Environment (non-secret, throwaway): `NEXT_PUBLIC_API_URL=http://localhost:4000` (workflow level; apps/web refuses to build or typegen without it), `DATABASE_URL` and `TEST_DATABASE_URL=postgresql://investfund:investfund@localhost:5432/investfund` (test job only). The API test helpers supply every other variable (`apps/api/src/__tests__/support.ts`); integration suites create and drop their own migrated databases (`packages/test-utils/src/db.ts`).

Fresh-checkout prerequisites found while simulating in a clean clone:
- `pnpm install` already builds `packages/shared` (`prepare`) and generates the Prisma client (apps/api `postinstall`, allowed in `pnpm-workspace.yaml`), so no separate `prisma generate` step is needed.
- **`next typegen` is required before `pnpm lint`.** Without `.next/types`, `next/root-params` is untyped and ESLint reports `no-unsafe-assignment`/`no-unsafe-call` in `apps/web/src/i18n/request.ts`. `pnpm typecheck` passes without it, so a fresh-clone developer sees lint fail while typecheck passes. CI runs `pnpm --filter @investfund/web exec next typegen` first. Suggested follow-up for the frontend owner: a `typegen` script in apps/web (or run it from the root `lint` script) so local and CI commands are identical.

## Deviations and deferrals (orchestrator decision for R0 S0.4)
- `unit` and `integration` are a single `test` job using a GitHub `services:` container instead of Testcontainers.
- Deferred to P0-TEST-01: coverage thresholds, coverage artefact and coverage numbers in the job summary (needs `@vitest/coverage-v8`, not yet approved). AC2 is therefore not met yet.
- Deferred to R1 S1.11: `e2e-smoke` job (compose sandbox, Playwright smoke, axe, report artefact).
- Postgres service image is `pgvector/pgvector:0.8.7-pg16` (pinned tag matching `infra/docker-compose.yml`) rather than the floating `pg16` tag. It is pinned by tag, not by digest.
- AC1, AC3, AC6 and the integration test requirement (one failing and one passing run on a throwaway PR) still need a real GitHub run after the push (Gate C). CI duration (AC4) is recorded then.

## Local verification (2026-10-09)
- YAML parses (node `yaml`); `actionlint` 1.7.11 reports no issues (shellcheck was not available, so `run:` scripts were not shellchecked). Prettier formats both files.
- Each job's `run:` steps, extracted from `ci.yml`, ran in a fresh `git clone` with `pnpm install --frozen-lockfile` (Node 22.22.0, pnpm 12.10.1) against a new empty Postgres 16 + pgvector database: lint (all four checks) pass; `prisma migrate deploy` applies both migrations; tests 50 files, 599 passed, 2 todo; build and OpenAPI check pass; audit fails (below).
- Negative checks: a lint error fails `pnpm lint`; a shared schema change without regenerating fails the OpenAPI step with the regeneration message.
- Audit: `pnpm audit --audit-level high` initially failed with one high advisory, GHSA-ggr8-5vv4-36mx in `deepmerge-ts` 7.1.5 (<8.0.0), a dev-only transitive dependency via `prisma` 6.19.3 → `@prisma/config`. **Resolved (human decision 2026-10-09, option A):** `overrides: deepmerge-ts: 8.0.2` in `pnpm-workspace.yaml`; `pnpm audit --audit-level high` now reports no known vulnerabilities, and `prisma validate`, `prisma migrate deploy` on a fresh database, and all checks pass.

## Needs human decision / approval
- **Gate X:** approve the new workflow before it is committed (CLAUDE.md §5.3).
- **Audit override:** remove the `deepmerge-ts` override in `pnpm-workspace.yaml` once a Prisma release depends on `deepmerge-ts` >= 8.

## Branch protection checklist (human, GitHub settings → Branches → `main`)
- [ ] Require a pull request before merging (at least 1 approval).
- [ ] Require status checks to pass before merging, with required checks: `lint`, `test`, `build`, `audit` (they appear after the first workflow run).
- [ ] Require branches to be up to date before merging.
- [ ] Block force pushes and deletions on `main`.
- [ ] Settings → Actions → General: workflow permissions "Read repository contents"; restrict actions to GitHub-owned plus `pnpm/action-setup` (optionally require SHA pinning).
- [ ] Add `e2e-smoke` (R1 S1.11) and the coverage gate (P0-TEST-01) to the required checks when they land.
