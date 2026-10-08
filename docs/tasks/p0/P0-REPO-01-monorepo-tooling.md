# P0-REPO-01: Monorepo, TypeScript and lint tooling
Owner: backend        Estimate: M
Requirements: NFR-MAINT-01
Depends on: none

## Goal
Give every agent the same workspace layout, TypeScript strictness, formatting and lint rules from the first commit, so later cards only add code and never re-argue tooling. Line endings are normalised to LF so Windows and Linux (CI) produce identical diffs.

## Scope
- In: root `package.json` (pnpm workspaces, `packageManager` pin, `engines.node` pinned to the current Node LTS); `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `infra/mocks/*`); empty package shells `apps/web`, `apps/api`, `packages/shared`, `packages/test-utils` (each with `package.json` and `tsconfig.json` only); `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`); ESLint flat config (typescript-eslint strict-type-checked, import ordering, `no-explicit-any` as an error, a restricted-syntax rule banning `$queryRawUnsafe` and `$executeRawUnsafe`); Prettier config; `.editorconfig`; `.gitattributes` (`* text=auto eol=lf`, binary patterns for images, PDF and Office files); `.nvmrc`; root scripts (`dev`, `build`, `lint`, `typecheck`, `test`, `format`, `format:check`); a root Vitest workspace file that discovers package configs; a README "Getting started" section with a Windows/WSL2 note; `scripts/check-eol.mjs`.
- Out: application code, Docker, CI, Next.js or Express setup (other cards). Changes to `CLAUDE.md` §9 (the commands table is proposed to the human, not edited).

## Contracts / inputs
- Endpoints: none
- Schemas: none
- Tables: none
- Dependencies: P0 row of `docs/PHASE_PLAN.md` §6. **Gate X approval is needed before `pnpm add`.**

## Acceptance criteria
1. Given a clean clone on Windows or Linux, When `pnpm install` runs, Then it completes with a lockfile and no peer-dependency errors.
2. Given the repo, When `pnpm lint && pnpm typecheck && pnpm format:check` run, Then all pass with zero warnings.
3. Given a TypeScript file containing `const x: any = 1`, When `pnpm lint` runs, Then it fails with `@typescript-eslint/no-explicit-any`.
4. Given a file containing `prisma.$queryRawUnsafe(...)`, When `pnpm lint` runs, Then it fails.
5. Given a text file committed with CRLF line endings, When `git add --renormalize .` runs, Then `git ls-files --eol` shows it stored as `i/lf`, and `node scripts/check-eol.mjs` exits 0.
6. Given `pnpm test` at the root, When no tests exist yet, Then it exits 0 (`passWithNoTests`) and lists each package's Vitest project.
7. Given a full build, When `git status` runs, Then no `dist/`, `.next/`, `coverage/`, `storage/` or `.env` files appear as untracked.

## Test requirements
- Unit: none (tooling).
- Integration: `scripts/check-eol.mjs` fails on a fixture with CRLF and passes on LF (run in CI by P0-CI-01).
- E2E / non-functional: `pnpm lint`, `pnpm typecheck` and `pnpm format:check` together finish in under 60 s on the empty repo.

## Notes / risks
- Never commit `.env`; `.env.example` already exists.
- List the exact dependency versions in the Gate X request.
