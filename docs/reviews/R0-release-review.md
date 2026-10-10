# Supervisor release review: R0 Foundations

| | |
|---|---|
| Release | R0: Foundations (lean finish), `docs/PHASE_PLAN.md` §3 |
| Branch / commit | `feature/p0-foundations-n0ovxp` at `d0c386a` |
| Diff | `git diff origin/main...HEAD`: 12 commits (`08fe28f..d0c386a`), 303 files, +28 505 / −434 |
| Inputs | `CLAUDE.md` §5, §7, §10; `docs/ARCHITECTURE.md`; `docs/API.md`; `docs/DATABASE.md`; `docs/PHASE_PLAN.md`; `docs/tasks/p0/*`; tester report `docs/test-reports/R0-foundations.md` (untracked; PASS with conditions, D-01 to D-07); skill `code-review-standards` |
| Date / reviewer | 2026-10-10 · Supervisor |
| Gate checklist | `PHASE_PLAN.md` v2 has no release gate checklist, so I used the v1 checklist (`docs/archive/PHASE_PLAN_v1.md` §9). Gate C needs approved commits and green CI. Gate D needs the cards committed, a passing report, and current docs and OpenAPI. |

## 1. Verdict

**Approved for Gate C, with required fixes.** The fixes affect documentation only, and CI must be confirmed green. No application code has to change before the PR.

The code is a solid foundation:

- **Composition root:** a clean composition root in `core/container.ts`, with `createApp` free of side effects.
- **Contracts:** shared Zod contracts with deterministic OpenAPI and a drift check in CI.
- **Security baseline:** a careful security baseline with good tests. It covers fail-fast config that never echoes values, JWT pinned to HS256 with iss/aud/exp, an AES-256-GCM key ring with rotation, path-safe storage, a fail-closed limiter keyed only by HMAC, log redaction and CI hardened with SHA pins.

I found no blocking security, privacy or architecture defect. Everything else is a follow-up for R1.

Review R0: **PASS for Gate C, subject to RF-1 to RF-3.**

## 2. Required before the PR (Gate C)

Keep it to one docs-only commit (`docs: reconcile R0 task statuses, sandbox notes and decisions log`), plus a human check of CI.

| ID | Owner | File:line | Issue | Required fix | Why it blocks |
|---|---|---|---|---|---|
| RF-1 | orchestrator (docs) | `docs/tasks/p0/README.md:9,10,11,18,21`; `docs/tasks/p0/P0-API-02-core-security.md:2`; `docs/tasks/p0/P0-WEB-04-api-client.md:2` | Tester D-02. WEB-04 shows `in-review` with no commit, but it is in `d0c386a`. The API-02 card header says `in-review`. The Commit column is empty for REPO-01 (`08fe28f`), SHARED-01 (`4dc4995`), INFRA-01 (`a6c6b24`) and WEB-01 (`acf4206`). | Set the statuses to `committed` and fill in the hashes. | `main` must not carry a wrong release record. The task table is the audit trail for Gate D. |
| RF-2 | orchestrator (docs) | `README.md:5`, `README.md:78`; `infra/docker-compose.yml:141,207` | Tester D-01. The README documents `--profile sandbox up -d --build`, which cannot work. `apps/web/Dockerfile` does not exist, and `worker` runs `dist/worker.js`, which is never built (API-03 is deferred to R2). `README.md:5` still says "Application code has not been written yet". | In the README, mark the sandbox profile "not runnable until R2 (needs the web Dockerfile and P0-API-03)" and update the status line. In the compose comment at `:141`, change the owners to "web Dockerfile: card TBD (R2); worker: P0-API-03". Comments only; no change to compose behaviour. | A merged README must not tell contributors to run a command that fails. |
| RF-3 | orchestrator, human confirms | `docs/DECISIONS_LOG.md` | Several human Gate X decisions from R0 are recorded only on task cards: the **CI workflow approval** (P0-CI-01; the log still says "CI file still needs its own Gate X"), the **`deepmerge-ts` 8.0.2 override** (CI-01 card, "option A"), the **WEB-04 dependencies** (`msw`, `react-hook-form`, `@testing-library/user-event`, `jsdom`), the **Prisma 6.19.3 pin** in place of 7.x, and `helmet`/`jose` (API-02). | Add one row per decision, after the human confirms each one was actually approved. | CLAUDE.md §5.3: the log is the single record of security, CI and dependency approvals. A missing CI approval record matters most. |
| (precondition) | human | GitHub Actions | Tester R-01: no agent session could observe the CI run for `d0c386a`. | A human confirms that `lint`, `test`, `build` and `audit` are green on the pushed head. Optionally, enable branch protection with those four checks. | Gate C evidence: "CI green". |

Optional for the same docs commit: these are cheap, and they are follow-ups if skipped.

- `docs/API.md:132` and `packages/shared/src/openapi/document.ts:59` say readiness checks "DB, Redis and storage". R0 has no Redis check. The docs line is trivial. The OpenAPI summary is code (backend) and needs a regenerate, so it fits F-3.
- `docs/PHASE_PLAN.md:45` says Playwright went to "S1.10" and WEB-03 to "S1.9". The session table and the tasks README say S1.11 and S1.10. This is a clerical fix to an approved plan, so it needs a nod from the human.
- `docs/API.md:3` still says "Draft v0.1, awaiting human approval (Gate A)", but `DECISIONS_LOG.md:6` records it as approved on 2026-10-08.

## 3. Findings by area

Severity scale: blocker / major / minor / nit. No blockers or majors remain after RF-1 to RF-3.

### 3.1 Architecture conformance: pass

- **Layering and DI.** `apps/api/src/core/container.ts:253-327` is the only place that builds concrete classes. `app.ts:64-99` only composes middleware and mounts `ApiModule`s. The change to the `express-module` skill (modules registered in the container, `app.ts` not edited per module) is a good rule.
  - **Nit:** `container.ts:211` imports `type AppDeps` from `../app.js`, a type-only cycle from core to app. It is harmless. Consider moving `AppDeps` into `core/` when modules arrive.
- **Core boundaries.** The cross-cutting modules sit under `core/` as `ARCHITECTURE.md:41` describes, and each has an `index.ts`. The deviation `core/file-storage` instead of `core/storage` is acceptable. The root `.gitignore` pattern `storage/` is unanchored and would ignore `src/core/storage/`. That is a better reason than the settings rule and should be the one recorded on the card.
- **Contract first.** `HealthReport`, `HealthLive`, `ProblemDetails`, the problem slugs and the rate-limit presets come from `@investfund/shared`. The web client parses responses with the same schemas (`apps/web/src/lib/api/health.ts:20-26`). The shared constants are tested against the `API.md` tables.
- **OpenAPI drift (minor, backend → F-3).** The committed `packages/shared/openapi/openapi.json` does not describe what API-02 added:
  - `GET /api/v1/openapi.json` can return 401/403 in production and 503 `dependency-unavailable` when the limiter fails closed.
  - There is no `securitySchemes.bearerAuth`.
  - The 429 response does not declare `Retry-After`/`RateLimit-*` (carried over from the wave-2 review).

  S1.1 adds the first authenticated endpoints and needs `bearerAuth` anyway, so fix all of these together then.

### 3.2 Security (OWASP API Top 10 basics): pass

| Area | Evidence | Notes |
|---|---|---|
| Headers | `core/security/security-headers.ts:294-311`: deny-all CSP, HSTS only in production, `X-Powered-By` disabled (`app.ts:66`) | OK |
| CORS | `core/security/cors.ts:229-263`: exact allowlist, rejects `*`/`null`, `Vary: Origin`, credentials only for the allowed origin | OK |
| JWT | `core/auth/access-token.ts:53-59`: `algorithms:['HS256']`, iss, aud, `requiredClaims ['exp','sub']`, 5 s skew, Zod-checked claims, generic errors | **Nit (F-6):** add `maxTokenAge: '15m'` when S1.2 issues tokens, as defence in depth against long-`exp` tokens. |
| Config and secrets | `core/config/config.ts:158-184`: production rejects short or placeholder secrets, the dev encryption key, a missing `WEB_URL` and the memory limiter; `ConfigError` lists names only | OK. `.env.example` holds only placeholders and a documented dev-only key that production refuses. No secrets are tracked (checked). |
| Trust proxy | `config.ts:100-111` refuses `true` | **Minor (F-9):** in production behind a proxy, `TRUST_PROXY=false` makes every client share the proxy IP, so the `auth` and `default` limits would trip globally. Make `TRUST_PROXY` a required production setting in the hosting ADR. |
| Crypto | `core/crypto/cipher.ts`: random 96-bit IV, 128-bit tag, versioned key ring, private fields, `toJSON` and `inspect` show versions only, generic `DecryptionError` | OK |
| Rate limiter | `core/rateLimit/rate-limit.ts:62-71`: fails closed (503); `postgres-store.ts:135-149`: one atomic upsert using DB time; tagged-template SQL only | **Minor (F-7):** `core/openapi/openapi.routes.ts:22` runs the guards before the limiter, so 401 responses are not rate-limited. Brute-forcing tokens is not realistic with ≥32-character HS256 secrets, but put the limiter first on unauthenticated paths (with the `ip` subject) as the convention for S1.2. |
| Storage | `core/file-storage/local-disk-storage.ts:24-25,144-152`: strict key regex with a shard cross-check plus a root-prefix check; files `wx` 0600, directories 0700; the size limit is enforced while streaming, and partial files are removed | OK |
| Log redaction | `core/logger/logger.ts:19-42`, `http-logger.ts:109-116` (path only, no query, headers or bodies); `core/db/prisma.ts:324-333` (no query parameters) | **Minor (F-5):** before S1.1 logs anything about users, add `email`, `ip`/`ipAddress` and `databaseUrl` to `SENSITIVE_KEYS`. |
| CI | `.github/workflows/ci.yml`: `permissions: contents: read`, `persist-credentials: false`, actions pinned to SHAs, no `secrets.*`, throwaway service credentials | **Nit:** add Dependabot (github-actions ecosystem only) so the SHA pins get updates. That is a CI change (Gate X). |
| Web | `apps/web/src/lib/security-headers.ts:25`: `script-src 'unsafe-inline'` (D-05; accepted for P0 as H5) | **Major for R1, not R0 (F-2):** S1.3 keeps the access token in browser memory, so XSS would mean token theft. Ship the nonce-based CSP no later than S1.3. |

### 3.3 Privacy (UK GDPR): pass, with one wording correction

- No raw IP is stored: `rate_limit_buckets.key_hash` is an HMAC (verified in `postgres-store.int.test.ts`). Request logs have no query strings, the readiness body is minimal, and error bodies carry no stack or cause.
- **Minor (F-8, supervisor):** `docs/DATABASE.md:310` classifies the table as "PII: none". A keyed hash of an IP address or user ID is **pseudonymised** personal data under UK GDPR, not anonymous data, because whoever holds `IP_HASH_SECRET` can re-identify it by enumeration. Reclassify it as "pseudonymous; retention minutes" and list it in the records of processing at S1.1. I will make this change; it does not affect the code.

### 3.4 Database conventions: pass

- Migrations `20261009000000_init_extensions` and `20261009201159_rate_limit_buckets` are additive and named in Prisma style. The extensions use `IF NOT EXISTS`, which matches `infra/postgres/init/01-extensions.sql`.
- `rate_limit_buckets` (`schema.prisma:27-41`) follows `DATABASE.md` §1: UUID v7 `id` generated in the app, `created_at`/`updated_at` timestamptz, `@@map` and `@map`. It also matches the `DATABASE.md:299-310` entry: `UNIQUE(preset, key_hash)`, `INDEX(window_ends_at)` and `char(64)`. The migration plan row (`DATABASE.md:1196`) is updated.
- **Nit:** `hits integer` has no `CHECK (hits > 0)`. Not worth a migration now.
- **Nit (production ADR):** `CREATE EXTENSION vector` needs sufficient privileges on managed Postgres. Note this in the hosting ADR.
- Prisma 6.19.3 instead of 7.x is justified on the DB-01 card (7.x needs adapter dependencies). It needs a log entry (RF-3).

### 3.5 Test quality: good; coverage gate open

- Assertions are meaningful: problem+json bodies are parsed with the shared schema, `RateLimit-Remaining` is checked on every one of the 10 requests, the upsert is shown atomic with 40 concurrent hits, `alg:none` and wrong iss/aud are covered, a live log grep checks for secrets, and the DB-down readiness path is tested.
- Isolation is good: each suite gets its own database and drops it (`packages/test-utils/src/db.ts`), and URLs are scrubbed from errors.
- **Minor (F-10), flaky timing:**
  - `apps/api/src/core/http/__tests__/lifecycle.int.test.ts:25,58,70` use `sleep(50)` to assume the request has reached the handler. On a loaded CI runner shutdown can start first, and the in-flight assertion then fails. Use a latch that the handler resolves on entry.
  - `postgres-store.int.test.ts:80,103,116` rely on real-time sleeps with a 100 ms margin. They are acceptable but should be watched.
- **Coverage (condition, F-1).** The tester says `@vitest/coverage-v8` is "not on the approved list". That is wrong. The P0 dependency row, which includes `@vitest/coverage-v8`, `testcontainers`, `@playwright/test`, `@axe-core/playwright` and `@faker-js/faker`, was approved on 2026-10-08 (`docs/DECISIONS_LOG.md:7`, `docs/archive/PHASE_PLAN_v1.md:296`). Only the version pin and the **CI change** (Gate X) remain.
  - R0 has no `src/modules/**` code, so the API ≥ 80% threshold has nothing to measure yet. The web ≥ 70% threshold is simply unverified.
  - This does not block Gate C. The human must accept the deferral explicitly at Gate D, and coverage must be the first R1 card.
- **AC traceability gaps (D-03).** REPO-01 AC3, AC5 and AC7 and INFRA-01 AC4 were verified only by hand. `check:compose` and its negative fixture exist but are not run in CI. This is accepted for R0 and goes to F-4.

### 3.6 Documentation consistency

- D-01 and D-02 are covered by RF-1 and RF-2. The other doc drift is listed under "Optional" in §2.
- **Nit:** the `CLAUDE.md` §9 command table still has placeholders. `pnpm --filter web test:e2e` does not exist, and the real scripts are `pnpm db:migrate` and `pnpm seed`. Changing it needs human approval, so propose it at the R1 Gate A.
- **Nit:** `PHASE_PLAN.md` v2 has no per-release exit checklist. I will add a short Gate C/D checklist template when I plan R1.
- **Process:** the Postgres-backed rate limiter, its fail-closed policy and the lean workflow are significant decisions recorded only in `DECISIONS_LOG`. I will write **ADR 0002 (rate-limit store and failure policy)** at the R1 Gate A. Only ADR 0001 exists today.

### 3.7 Dependency hygiene

- All `package.json` versions are exact pins (checked: no `^`, `~` or `latest`), and the base images are pinned (`node:22.23.3-alpine3.24`). `pnpm install --frozen-lockfile` is clean.
- **`deepmerge-ts` override** (`pnpm-workspace.yaml:16-19`): it forces a major version (7 → 8) under `prisma` → `@prisma/config`, which is CLI only and not in the runtime client. `prisma validate`, `migrate deploy` and `generate` pass with it. Accept it, record it (RF-3), and re-check at every release end. It can be removed once Prisma moves to ≥ 8.
- **Minor (F-11), deprecated packages:** `eslint` 9.39.5 is marked "no longer supported" in the lockfile (`pnpm-lock.yaml:2457`). The tester did not flag this. `prom-client` 15.1.3 is deprecated in favour of `@prometheus-io/client`. Neither has a known advisory. Plan upgrades as one Gate X dependency request.
- **Nit:** `.nvmrc` says `22`, so CI resolves the latest 22.x while the images pin 22.23.3, and the tester ran 22.22.0. Pin `.nvmrc` to `22.23.3` so CI, Docker and local runs match.
- **Nit:** `.env.example:19,24` list `REDIS_URL` and `JWT_REFRESH_SECRET`, which the API does not read yet. That is harmless, but add "(from S1.2 / R2)" comments.

## 4. Follow-up cards (proposed targets)

| ID | Sev. | Owner | Item | Target |
|---|---|---|---|---|
| F-1 | major | tester | Pin and install `@vitest/coverage-v8` (already approved), set thresholds (api `src/modules/**` ≥ 80%, web ≥ 70%), add coverage to the CI job summary (Gate X: CI change). Add the `test:unit`/`test:int` split and the `TEMPLATE.md` report template (seed it from the R0 report). | **R1 S1.1, first card** |
| F-2 | major | frontend | Nonce-based CSP through `proxy.ts` (`'nonce-…' 'strict-dynamic'`), removing `script-src 'unsafe-inline'` (D-05). | R1, no later than **S1.3** (before the access token is held in the browser) |
| F-3 | minor | backend | OpenAPI: `bearerAuth` security scheme; 401/403/503 and `Retry-After`/`RateLimit-*` on `/api/v1/openapi.json`; readiness summary without Redis; regenerate `openapi.json`. Optionally add the `servers` rule (wave-2 nit). | R1 S1.1 |
| F-4 | minor | tester | D-03: Vitest fixtures for `no-explicit-any`, `check-eol` (CRLF blob), `check-compose` (negative fixture exits 1) and the untracked-artefact check; add `pnpm check:compose` to the CI `lint` job (Gate X). | R1 S1.1 (with F-1, one Gate X) |
| F-5 | minor | backend | Logger: add `email`, `ip`, `ipAddress` and `databaseUrl` to `SENSITIVE_KEYS`, with a test. | R1 S1.1 |
| F-6 | nit | backend | `jwtVerify` `maxTokenAge: '15m'`; issuer uses the same constants. | R1 S1.2 |
| F-7 | minor | backend | Convention: on unauthenticated routes the rate limiter runs before the auth guards; apply it to `openapi.routes.ts:22`. | R1 S1.2 |
| F-8 | minor | supervisor | `DATABASE.md:310`: reclassify `rate_limit_buckets` as pseudonymous; add it to the records of processing. ADR 0002 (rate-limit store, fail-closed policy, R2 move to Redis). Gate C/D checklist template in `PHASE_PLAN.md`. | R1 Gate A |
| F-9 | minor | supervisor | Production hosting ADR: `TRUST_PROXY` required in production, privileges for `CREATE EXTENSION`, HSTS at the edge for web, and alerting on `dependency-unavailable` (R-06). | Before the first non-local deployment (R10 at the latest) |
| F-10 | minor | backend | Replace `sleep(50)` in `lifecycle.int.test.ts` with an entry latch. | R1 S1.1 or S1.2 (opportunistic) |
| F-11 | minor | backend + frontend | Dependency debt: `eslint` 9 (EOL) to a supported major with typescript-eslint, `prom-client` replacement, drop the `deepmerge-ts` override when Prisma allows, pin `.nvmrc`. One Gate X request. | R1 end (S1.11) or R2 start |
| F-12 | minor | backend + frontend | D-01 for real: web Dockerfile, the `worker` service enabled only with P0-API-03, and a decision on `web` egress in the sandbox (R-08). | R2 (with P0-API-03 and P0-TEST-02) |
| F-13 | nit | frontend | D-04 favicon (`src/app/icon.svg`); D-06 badge separator; a `typegen` pre-step for local `pnpm lint`. | R1 S1.10 (favicon), S1.4 (others) |
| F-14 | nit | backend | D-07(b): pass the request logger to the readiness registry so the failure `warn` carries `req.id`. | R1, opportunistic |
| F-15 | major | tester | Bring the Playwright and axe setup forward from S1.11 to about S1.3, so the auth and app UI get journey and accessibility checks as they are built (R-03). | R1 S1.3 |

## 5. Decisions needing the human

1. Approve RF-1 to RF-3 as one docs-only commit on the release branch (Gate B), then Gate C once CI is confirmed green.
2. For RF-3: confirm each Gate X approval to be recorded: CI workflow, `deepmerge-ts` override, WEB-04 dependencies, Prisma 6 pin, `helmet`/`jose`.
3. At Gate D: explicitly accept the R0 deferrals. These are coverage measurement (F-1, first R1 card), Playwright/axe (F-15), the Docker and sandbox ACs (R2), and Testcontainers.
4. Approve moving the Playwright/axe setup forward to around S1.3 (F-15) and the nonce CSP by S1.3 (F-2). Both change the approved R1 session contents.
5. Optional clerical fixes in the same docs commit: `PHASE_PLAN.md:45` session numbers and `API.md:3` status line.
