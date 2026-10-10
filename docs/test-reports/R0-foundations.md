# Test report: R0 Foundations (release end)

| | |
|---|---|
| Release | R0: Foundations (Phase 0, lean finish), `docs/PHASE_PLAN.md` §3 |
| Branch / commit | `feature/p0-foundations-n0ovxp` at `d0c386a` (same commit as `origin/feature/p0-foundations`) |
| Release diff | `origin/main...HEAD`: 12 commits, `08fe28f..d0c386a`, 303 files, +28 505 / −434 |
| Date | 2026-10-10 |
| Author | Tester agent |
| Template | `docs/test-reports/TEMPLATE.md` does not exist yet (P0-TEST-01 is partial). This report uses the sections that P0-TEST-01 AC6 requires: suites, coverage, budgets, invariants and open defects. |

## 1. Summary

```
## Test report: R0 Foundations
Result: PASS (with conditions; see §8)
Suites: unit 501/501 (+2 todo), integration 151/151, e2e 0/0 (Playwright deferred to R1 S1.11)
        all suites: 56 files, 652 passed, 0 failed, 2 todo
Coverage: api not measured, web not measured (no coverage provider approved yet)
Non-functional: API /health/live p95 2.6 ms (budget 20 ms); security headers, CORS, problem+json,
        rate limit 429 + Retry-After, fail-closed limiter, OpenAPI admin gate and log hygiene verified
        on the built server; pnpm audit clean; web routes, lang, theme, headers and dev-badge rule
        verified in headless Chromium
Defects: 0 critical, 0 high, 1 medium (D-01), 4 low (D-02 to D-05), 2 info (D-06, D-07)
Report file: docs/test-reports/R0-foundations.md
```

**Verdict: ready for Gate C**, provided that:

1. a human confirms the GitHub Actions run for the pushed commits is green (`lint`, `test`, `build`, `audit`), because this session cannot read it; and
2. the human accepts the deferrals in §7, especially no coverage measurement and no E2E or sandbox run in R0.

D-01 and D-02 are recommended fixes, but they do not block Gate C.

## 2. Environment and constraints

| Item | Value |
|---|---|
| OS / runtime | Linux 6.18, Node 22.22.0 (`.nvmrc`: 22), pnpm 12.10.1 |
| Database | Local PostgreSQL 16.15 with pgvector **0.6.0** at `localhost:5432` (superuser `investfund`). CI uses the `pgvector/pgvector:0.8.7-pg16` image, so the pgvector version differs from CI. R0 has no vector columns, so this has no effect yet. |
| Docker | The Docker daemon is not reachable here (`Cannot connect to the Docker daemon`; one attempt only), and Docker Hub is rate-limited. **The Compose stack, the sandbox profile, the mock containers and Testcontainers were not run.** |
| Playwright | Not installed (deferred to R1 S1.11). Headless smoke checks used Chromium 1194 (`/opt/pw-browsers/chromium-1194`) through a dependency-free CDP script in the tester scratch directory. Nothing was added to the repo. |
| Coverage | `@vitest/coverage-v8` is not approved, so coverage was **not measured**. Nothing was installed. |
| GitHub CI | The run result for the pushed commits cannot be read from this session (the GitHub MCP connection failed). **To be verified by a human.** |
| Network | Chromium's own background update calls to Google were refused by the egress proxy. The app made no external calls. |
| Data | Synthetic only. The JWT, encryption and IP-hash secrets were random throwaway values generated for each run and never written to the repo. |
| Clean-up | The fresh clone, the throwaway database `r0_ci_fresh`, the per-suite test databases (dropped by the suites), the storage directory and the browser profiles were all deleted. Every API, web and Chromium process was stopped by PID. Postgres was left running. Nothing in the working tree was changed except this report. |

## 3. Functional regression from a fresh clone (the exact CI steps)

`git clone` of the repository at `d0c386a` into the scratch directory, with `NEXT_PUBLIC_API_URL=http://localhost:4000`, `NEXT_TELEMETRY_DISABLED=1` and `PRISMA_HIDE_UPDATE_MESSAGE=1`, as in `ci.yml`. The `test` job ran against a **new, empty database** `r0_ci_fresh` (`DATABASE_URL` = `TEST_DATABASE_URL`).

| CI job | Step | Result | Wall time |
|---|---|---|---|
| (setup) | `pnpm install --frozen-lockfile` | pass (no peer-dependency errors; postinstall generated the Prisma client and `prepare` built `packages/shared`) | 18.7 s |
| lint | `pnpm --filter @investfund/web exec next typegen` | pass | 1.8 s |
| lint | `pnpm lint` (`--max-warnings 0`) | pass, 0 warnings | 31.9 s |
| lint | `pnpm typecheck` | pass | 13.8 s |
| lint | `pnpm format:check` | pass | 5.4 s |
| lint | `pnpm check:eol` | pass ("Git index, LF only") | 0.6 s |
| test | `prisma migrate deploy` on a fresh database | pass: `20261009000000_init_extensions` and `20261009201159_rate_limit_buckets` applied; `vector` and `citext` present; `rate_limit_buckets` has its PK, `UNIQUE(preset,key_hash)` and `INDEX(window_ends_at)` | 2.0 s |
| test | `pnpm test` (default and JSON reporters) | **pass: 56 files, 652 passed, 0 failed, 2 todo** | 31.1 s |
| build | `pnpm build` | pass: api (tsc and Prisma generate), shared, mocks, web (Next.js 16.4.0; routes `/en-GB`, `/en-GB/login`, `/en-GB/app`, `/en-GB/dev/ui`, `[...rest]`) | 21.7 s |
| build | `openapi:generate`, then `git status --porcelain -- packages/shared/openapi` | pass (no drift) | 2.3 s |
| audit | `pnpm audit --audit-level high` | pass: "No known vulnerabilities found". A full `pnpm audit` with no level also reports none. | 0.8 s |

Total for the steps: about 130 s locally, against CI-01 AC4's budget of 15 min. CI wall time is still to be recorded from GitHub.

After the build, `git status --porcelain` in the clone was **empty**, so no build output is left untracked. `dist/`, `.next/`, `generated/` and `next-env.d.ts` are all ignored (REPO-01 AC7). Every per-suite test database was dropped after the run.

Install noise (informational): `@prisma/client postinstall: prisma:warn We could not find your Prisma schema`. This is harmless, because the api `postinstall` generates the client next.

### 3.1 Suites

| Package | Files | Tests passed | Todo | Unit | Integration (Supertest / real Postgres) |
|---|---|---|---|---|---|
| `packages/shared` | 5 | 103 | 0 | 98 | 5 (OpenAPI generation and structure) |
| `packages/test-utils` | 1 | 5 | 0 | 5 | – |
| `infra/mocks` (llm and google) | 6 | 121 | 2 | 49 | 72 (Supertest and wire tests over HTTP) |
| `apps/api` | 25 | 255 | 0 | 104 (10 files) | 151 (15 `*.int.test.ts` files; 5 of them, 22 tests, run against real PostgreSQL) |
| `apps/web` | 19 | 168 | 0 | 168 (Vitest, Testing Library and MSW) | – |
| **Total** | **56** | **652** | **2** | | |

Note on the summary line: "unit 501" counts every test outside the `*.int.test.ts` API files. "integration 151" is the API `*.int.test.ts` set. The mock-server HTTP tests are counted under unit in that line.

The two `todo` tests are the official-client wire tests: `openai` in the mock LLM (Gate X, R2) and `googleapis` in mock Google (Gate X, R5/R6).

Slowest files: `lifecycle.int` 6.8 s, `raw-unsafe-lint` 5.1 s, `test-database.int` 5.0 s, `server.int` 2.5 s. Every other file finishes in under 1.2 s.

### 3.2 Coverage

**Not measured.** `@vitest/coverage-v8` is not on the approved dependency list. The DoD thresholds in `CLAUDE.md` §7 (api modules ≥ 80%, web ≥ 70%) and CI-01 AC2 therefore cannot be verified. R0 has no `src/modules/**` code yet; all API code is in `src/core/**`. Under the tester rules a report must fail when the thresholds are not met. Because the thresholds cannot be measured at all, this is reported as an **open condition** rather than a pass. It is to be closed by P0-TEST-01 in R1 (see §7 and R-02).

## 4. Acceptance-criteria traceability

Status key: **pass** = automated test(s) green in this run; **pass (manual)** = verified by hand in this run with no automated test; **partial**; **deferred → target**; **n/v** = not verifiable in this environment. ⚠ marks an AC that has **no automated test**.

### P0-REPO-01: Monorepo, TypeScript and lint tooling

| AC | Evidence | Status |
|---|---|---|
| 1 Clean clone installs with no peer errors | Fresh clone: `pnpm install --frozen-lockfile` rc 0 with no peer warnings (Linux). Windows not checked. | pass (Linux); Windows n/v |
| 2 lint, typecheck and format:check pass with zero warnings | CI steps in §3 | pass |
| 3 `const x: any` fails lint ⚠ | Manual: a temporary file in the clone failed with `@typescript-eslint/no-explicit-any`. No fixture test exists. | pass (manual), no test (D-03) |
| 4 `$queryRawUnsafe` fails lint | `apps/api/src/core/db/__tests__/raw-unsafe-lint.test.ts` | pass |
| 5 CRLF is renormalised and `check-eol` behaves ⚠ | Manual: a CRLF file is stored as `i/lf` after `git add`; `check-eol` exits 0. A CRLF blob placed in the index makes `check-eol` exit 1 with a fix hint. The card asks for an automated fixture test, which does not exist. | pass (manual), no test (D-03) |
| 6 `pnpm test` passes with no tests and lists the projects | Superseded, because tests now exist. Vitest runs the shared, test-utils, mocks, api and web projects. | pass (n/a as worded) |
| 7 No untracked build output ⚠ | `git status --porcelain` empty after a full build in the fresh clone. Not checked in CI. | pass (manual) |
| NF lint + typecheck + format < 60 s | 51.1 s on the populated repo | pass |

### P0-SHARED-01: Shared contracts and OpenAPI

| AC | Evidence | Status |
|---|---|---|
| 1 Money valid and invalid cases | `packages/shared/src/__tests__/common.test.ts` (Money ×12) | pass |
| 2 CursorPageQuery maximum 100, default 20 | `common.test.ts` (CursorPageQuery ×9) | pass |
| 3 `toMinor` and the property-based round trip over 1 000 values | `money.test.ts` "round-trips 1 000 random two-decimal amounts exactly" | pass |
| 4 `formatMoney` gives `£1,250.50` | `money.test.ts` | pass |
| 5 OpenAPI output is deterministic, valid 3.1 and has the components | `openapi.test.ts` (5 tests) and the CI drift step | pass |
| 6 Both apps resolve `@investfund/shared` without path aliases | `pnpm typecheck`; `apps/web/test/shared-contract.test.ts`. The only alias is web's own `@/*` → `./src/*`. | pass |

### P0-INFRA-01: Docker Compose

| AC | Evidence | Status |
|---|---|---|
| 1 All services healthy within 60 s | Docker is unavailable here | n/v. Deferred to a human with Docker / R2 (P0-TEST-02) |
| 2 `vector` and `citext` exist | Verified on local PG through the migration and `test-database.int.test.ts`. The compose init script `infra/postgres/init/01-extensions.sql` was not exercised. | partial (migration path pass) |
| 3 Sandbox has no egress and can reach the mocks | Docker unavailable. The sandbox profile is also not buildable today (D-01). | n/v. Deferred to R2 (P0-TEST-02) |
| 4 Ports bound to 127.0.0.1 and no `latest` tag ⚠ | `pnpm check:compose`: OK for 8 services. Its negative fixture fails as expected with 6 problems. Neither is run by CI or a test. | pass (manual), no automated run (D-03) |
| 5 Data persists across `down` without `-v` | Docker unavailable | n/v. Deferred to R2 |
| NF start-up time recorded | Not possible | deferred to R2 |

### P0-API-01: Express skeleton

| AC | Evidence | Status |
|---|---|---|
| 1 `/health/live` returns 200 `{status:"ok"}` with `X-Request-Id` | `app.int.test.ts`; smoke on the built server | pass |
| 2 `X-Request-Id` is echoed and logged | `app.int.test.ts`, `security.int.test.ts` (any endpoint, malformed IDs replaced); smoke: `abc-123` echoed on a 404 | pass |
| 3 NotFoundError gives 404 problem+json with `requestId` | `app.int.test.ts` | pass |
| 4 Unknown error gives a generic 500 with no stack; the stack is logged | `error-handler.int.test.ts`, `security.int.test.ts` | pass |
| 5 Missing `JWT_ACCESS_SECRET` gives a non-zero exit naming the variable | `server.int.test.ts`; smoke: `JWT_ACCESS_SECRET (missing), ENCRYPTION_KEY (invalid)`, rc 1, no values printed | pass |
| 6 Logger redaction | `logger.test.ts` | pass |
| 7 `/api/v1/nope` returns 404 problem+json | `app.int.test.ts`; smoke | pass |
| 8 SIGTERM drains and exits 0 within 10 s | `server.int.test.ts`, `lifecycle.int.test.ts`; smoke: "shutdown complete", `timedOut:false`, in 5 ms | pass |
| 9 A failing readiness check gives 503 with no internal details | `app.int.test.ts`, `db-readiness.int.test.ts`; smoke with the database really stopped | pass |
| NF `/health/live` p95 < 20 ms | 2.63 ms (§5.1) | pass |
| Review: metrics route label for a throwing route | `metrics.int.test.ts` | pass |

### P0-API-02: Core security

| AC | Evidence | Status |
|---|---|---|
| 1 Security headers set, HSTS only when not local, no `X-Powered-By` | `core/security/__tests__/security.int.test.ts`; smoke (dev: no HSTS; production: `max-age=31536000; includeSubDomains`) | pass |
| 2 CORS allowlist | `security.int.test.ts` (5 hostile origins); smoke: allowed origin gets ACAO and credentials; `https://evil.example` gets no ACAO on preflight or on actual requests | pass |
| 3 The `auth` preset returns 429 with `Retry-After` on the 11th request | `rate-limit.int.test.ts` (memory store), `core-security.int.test.ts` (Postgres store). No `auth`-preset route is reachable in R0. Smoke on the `default` preset instead: request 61 to `/api/v1/openapi.json` → 429 problem+json, `Retry-After: 60`, `RateLimit-*` headers; the stored key is an HMAC hash | pass |
| 4 `validate()` gives 400 with path and code; unknown fields rejected | `validate.int.test.ts` | pass |
| 5 Random IV and tamper detection | `cipher.test.ts` | pass |
| 6 Key rotation from v1 to v2 | `cipher.test.ts` | pass |
| 7 An oversize stream aborts and leaves no partial file | `local-disk-storage.test.ts` | pass |
| 8 Path traversal is rejected | `local-disk-storage.test.ts` (11 keys) | pass |
| 9 Guard matrix 401 / 401 / 403 / pass | `auth-guards.int.test.ts` (24 tests, including `alg:none`, wrong iss/aud, tampered token); smoke in production mode: no token 401, invalid token 401 with `error="invalid_token"`, founder 403, admin 200 | pass |
| 10 Production OpenAPI is admin-only | `core-security.int.test.ts`, `security.int.test.ts`; smoke | pass |
| 11 Production with `OPENAPI_PUBLIC=true` logs one warn line | `core-security.int.test.ts`; smoke with the sandbox compose values: exactly one `warn` with `flag: "OPENAPI_PUBLIC"` | pass |

### P0-DB-01: Prisma init

| AC | Evidence | Status |
|---|---|---|
| 1 `init_extensions` applies; `vector` and `citext` exist | `prisma migrate deploy` on a fresh database (the CI step; `migrate dev` itself was not run); `test-database.int.test.ts` | pass |
| 2 Readiness returns 503 when the DB is down and 200 when it is up | `db-readiness.int.test.ts`; smoke: cluster stopped → 503 `db: fail` in 16 ms with no details; restarted → 200 | pass |
| 3 Parallel suites are isolated | `test-database.int.test.ts`. Deviation: a database per suite on an existing server instead of Testcontainers. | pass (with deviation) |
| 4 1 000 UUID v7 values are valid and ordered | `uuid-v7.test.ts` | pass |
| 5 Lint bans `$queryRawUnsafe` | `raw-unsafe-lint.test.ts` | pass |
| NF Testcontainers start-up time | Testcontainers not used. Per-suite database creation and migration takes about 5 s (`test-database.int`). | deferred → P0-TEST-01 (R1) |

### P0-MOCK-01: Mock LLM (parked until R2)

| AC | Evidence | Status |
|---|---|---|
| 1 Well-formed completion with `usage` | `llm/api.test.ts`, `llm/client.test.ts` (raw HTTP wire test). The official `openai` client test is `todo`. | pass (HTTP); official-client test deferred → R2 (Gate X) |
| 2 Embeddings are deterministic, unit length and of the configured dimension | `llm/api.test.ts`, `units.test.ts` | pass |
| 3 Fixture returned verbatim | `llm/api.test.ts` (header and marker variants) | pass |
| 4 Two 429s with `retry-after`, then success | `llm/api.test.ts` | pass |
| 5 Malformed JSON injection | `llm/api.test.ts`, `client.test.ts` | pass |
| 6 `/__calls` in order; `/__reset` empties it | `llm/api.test.ts` | pass |
| Container health in the sandbox | Docker unavailable | deferred → R2 (P0-TEST-02) |

### P0-MOCK-02: Mock Google (parked until R5)

| AC | Evidence | Status |
|---|---|---|
| 1 PKCE exchange; a wrong verifier gives `invalid_grant` | `google/api.test.ts`, `units.test.ts` | pass |
| 2 userinfo returns the seeded user | `google/api.test.ts` | pass |
| 3 `messages.send` records the decoded headers | `google/api.test.ts` | pass |
| 4 An injected reply appears in `history.list` | `google/api.test.ts` | pass |
| 5 freeBusy returns the window in UTC | `google/api.test.ts` | pass |
| 6 `events.insert` returns a `hangoutLink` | `google/api.test.ts` | pass |
| 7 `invalid_grant` injection | `google/api.test.ts` | pass |
| 8 `/__reset` clears all state | `google/api.test.ts` | pass |
| Official `googleapis` client test | `todo` | deferred → R5/R6 (Gate X) |

### P0-WEB-01: Next.js skeleton

| AC | Evidence | Status |
|---|---|---|
| 1 `/` redirects to `/en-GB`, which returns 200 | Smoke on the production build: `/` → 307 `Location: /en-GB`; `/en-GB` → 200; Chromium follows it and renders `h1 "InvestFund"`. No automated test. | pass (manual). Playwright → R1 S1.11 |
| 2 `html.dark` by default; the theme persists without a flash | `providers.test.tsx` (blocking script injected). Chromium: every page has `class="… dark"`, `color-scheme: dark`. After `localStorage.theme=light` and a reload, the page has `class="… light"` from server HTML with no client toggle. A true first-paint (no-flash) assertion needs Playwright. | partial (manual pass). Playwright → R1 S1.11 |
| 3 i18n guard for hard-coded JSX text | `apps/web/test/i18n-lint.test.ts` | pass |
| 4 Build fails naming `NEXT_PUBLIC_API_URL` when it is missing | `next-config.test.ts`, `env.test.ts`; manual `next build` without it: `NEXT_PUBLIC_API_URL is required but missing`, rc 1 | pass |
| 5 Security headers on `/en-GB` | `next-config.test.ts`, `security-headers.test.ts`; smoke: CSP (with `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`; also present on 404 and on the 307 redirect; no `X-Powered-By` | pass |
| 6 Localised not-found page with 404 | Smoke: `/en-GB/does-not-exist` → 404, `lang="en-GB"`, title "Page not found \| InvestFund" | pass (manual). Playwright → R1 S1.11 |
| NF Playwright smoke and axe | Not installed | deferred → R1 S1.11 |

### P0-WEB-02: Design tokens and primitives

| AC | Evidence | Status |
|---|---|---|
| 1 Contrast ≥ 4.5:1 in both themes | `apps/web/test/design-tokens.test.ts` (56 tests) | pass |
| 2 axe on the showcase in both themes ⚠ | No test (needs Playwright). The showcase renders in a `INVESTFUND_DEV_UI=true` build (200, no console errors) and returns 404 in a normal production build. | deferred → R1 S1.11 |
| 3 Raw colours fail lint | `tokens-lint.test.ts` | pass |
| 4 Visible focus ring | `primitives.test.tsx` checks the `ring` classes. No keyboard E2E test. | partial. E2E → R1 S1.11 |
| 5 Reduced motion disables transitions | `design-tokens.test.ts` ("switches off all animations and transitions under prefers-reduced-motion"; CSS level) | partial (CSS rule tested). Browser check → R1 S1.11 |
| 6 ThemeToggle works by keyboard and exposes its state | `theme-toggle.test.tsx` (native button, translated accessible name). The pressed state is set on the client and not asserted in a browser. | partial. E2E → R1 S1.11 |

### P0-WEB-04: Typed API client and MSW

| AC | Evidence | Status |
|---|---|---|
| 1 Typed `useHealth()`; badge shows "ready" | `api-status-badge.test.tsx`. **Against the real API** (production build with `INVESTFUND_DEV_UI=true`, API on 127.0.0.1:4100 with a matching `WEB_URL`): the badge shows `data-state="ready"`, "API: ready (127.0.0.1:4100)". This also exercises CORS and CSP `connect-src` together. | pass |
| 2 Contract violation gives `ApiError` kind `contract`, logged only in development | `client.test.ts` | pass |
| 3 `applyProblemToForm` sets the field message and focus | `problem-form.test.tsx` (real React Hook Form) | pass |
| 4 429 with `Retry-After: 30` gives `retryAfterSeconds` 30 | `client.test.ts` | pass |
| 5 Network error gives kind `network`, retried once | `api-status-badge.test.tsx` (2 calls), `query.test.ts` | pass |
| Badge hidden in production | `api-status-badge.test.tsx`; Chromium on the normal production build: no `[data-testid=api-status-badge]` on `/en-GB`, `/en-GB/login` or `/en-GB/app` | pass |
| Build with the client in Server and Client Components | `pnpm build` pass | pass |

### P0-CI-01: GitHub Actions

| AC | Evidence | Status |
|---|---|---|
| 1 A lint error turns the PR red | Local negative check recorded on the card. No GitHub run visible here. | n/v. **To verify by a human** on GitHub |
| 2 Coverage below 80% fails | No coverage provider | deferred → P0-TEST-01 (R1) |
| 3 Schema change without regeneration fails `build` | The drift step passes when clean here; the negative case was recorded on the card | partial. Failing run on GitHub to verify by a human |
| 4 All jobs finish within 15 min | About 130 s for the same steps locally | n/v on GitHub. To verify by a human |
| 5 SHA-pinned actions, read-only permissions, no secrets | Review of `ci.yml` and `.github/actions/setup/action.yml`: checkout, setup-node and pnpm/action-setup are all pinned to full SHAs; `permissions: contents: read`; `persist-credentials: false`; no `secrets.` references | pass |
| 6 A high advisory fails `audit` | Audit is clean now. The earlier `deepmerge-ts` failure, fixed by an override, is recorded on the card. | partial (passing path verified) |
| Integration: one failing and one passing PR run | Not visible here | to verify by a human |

### P0-TEST-01: Test tooling (partial)

| AC | Evidence | Status |
|---|---|---|
| 1 `pnpm test:unit` runs without Docker | There is no `test:unit` script. `pnpm test` runs every project without Docker but needs a Postgres server for the 5 DB suites. | partial / deferred → R1 |
| 2 `pnpm test:int` with Testcontainers | Not implemented. Per-suite databases on an existing server are used instead (DB-01 deviation). | deferred → R1 |
| 3 Coverage below threshold exits non-zero | No coverage provider | deferred → R1 (needs Gate X) |
| 4 Seeded `faker` (en_GB) factories | Not implemented (`packages/test-utils` has only `db.ts`) | deferred → R1 S1.1 (first entities) |
| 5 Playwright smoke and axe | Not installed | deferred → R1 S1.11 |
| 6 Test report template | `docs/test-reports/TEMPLATE.md` does not exist | deferred → R1 (this report can serve as the seed) |

**AC coverage summary (12 committed cards plus TEST-01):** 97 rows traced (ACs plus NF and review items).

| Status | Count | Notes |
|---|---|---|
| pass with automated tests | 64 | |
| pass by manual verification only | 7 | 4 of them have no automated test at all: REPO-01 AC3, AC5, AC7; INFRA-01 AC4 (D-03) |
| partial | 8 | |
| deferred with a target | 12 | |
| not verifiable here | 6 | Docker: INFRA-01 AC1/3/5. GitHub: the CI-01 runs. |

No committed AC was found failing.

## 5. Non-functional results

### 5.1 API smoke (built `apps/api/dist/server.js`, throwaway environment)

| Check | Result |
|---|---|
| Security headers | CSP `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, CORP/COOP `same-origin`, `Cache-Control: no-store` on health; no `X-Powered-By`; HSTS only with `NODE_ENV=production` |
| CORS | Allowed origin: preflight 204 with ACAO, credentials, methods, headers and `Max-Age: 600`; actual responses expose `X-Request-Id`, `Retry-After` and `RateLimit-*`. Denied origin: 204 with no ACAO, and actual responses carry no ACAO. |
| `/health/live` | 200 `{"status":"ok"}`; still 200 while the database is down (correct for liveness) |
| `/health/ready` | 200 `{db: ok, storage: ok}`; database stopped → **503** `{db: fail, storage: ok}` in 16 ms, no internal details; database restarted → 200 again with no API restart |
| 404 | `application/problem+json`, `type …/problems/not-found`, `requestId` echoed |
| Invalid JSON | 400 `validation-error`, generic detail "The request could not be parsed.", no parser message echoed |
| Oversize body (1.1 MB) | 413 `payload-too-large` problem+json |
| Rate limit | `default` preset (60/min per anonymous IP) on `/api/v1/openapi.json`: request 61 → 429 problem+json `rate-limited` with `Retry-After: 60` and `RateLimit-Limit/Remaining/Reset/Policy`. The stored key is a 64-hex HMAC with no IP in clear. `/health/*` is not limited. No `auth`-preset route exists in R0; it is covered by the integration tests (§4, API-02 AC3). |
| Rate limiter when the database is down | Fail-closed: `/api/v1/openapi.json` → 503 `dependency-unavailable` with a generic detail (the documented design) |
| OpenAPI exposure | Development: public, 200. Production with the flag unset: 401 with no token, 401 `invalid_token` for a garbage token, 403 for a founder, 200 for an admin. Production with `OPENAPI_PUBLIC=true` (sandbox values): exactly one `warn` naming the flag. |
| Config fail-fast | Missing or invalid variables are named without values. Production placeholders (`change-me`, the dev encryption key) are rejected as `weak`, and a missing `WEB_URL` is reported. The database password in `DATABASE_URL` never appeared in output. The sandbox compose throwaway values pass the production guards, so the sandbox `api` would boot. |
| Metrics | Served only on the internal listener (127.0.0.1:9564); `GET /metrics` on the public port → 404; the histogram has a route label |
| Error bodies | No stack, message or cause in any 4xx/5xx body observed |
| Logs | 479 of 479 request log lines carry `req.id`. The logs contain no JWT secret, encryption key, IP-hash secret, DB credentials, issued bearer token (an admin JWT was grepped for: 0 hits) or disallowed origin. Stacks appear only in error logs (by design). The readiness-failure `warn` line has no request ID (D-07). |
| Graceful shutdown | SIGTERM → "shutdown started" / "shutdown complete" (`timedOut:false`, `hookFailures:0`) |

**Latency sample** (200 sequential `curl` requests, loopback, single process, `time_total`):

| Endpoint | p50 | p95 | p99 | max | Budget |
|---|---|---|---|---|---|
| `GET /health/live` | 1.55 ms | **2.63 ms** | 3.57 ms | 6.55 ms | p95 < 20 ms (API-01 NF, recorded, not gating) → pass |
| `GET /health/ready` (DB `SELECT 1` and storage check) | 2.90 ms | **4.54 ms** | 18.87 ms | 19.49 ms | CRUD read p95 < 200 ms (closest class) → pass |

k6 load profiles (50 VUs, spike) are not applicable yet. R0 has no CRUD endpoints, and k6 is not installed.

### 5.2 Web smoke (`next start` on the production build plus headless Chromium)

| Path | HTTP | `lang` | Theme class | Title / h1 | Console |
|---|---|---|---|---|---|
| `/` | 307 → `/en-GB` | en-GB | dark | "Fundraising for UK startups \| InvestFund" / InvestFund | 1 error: `/favicon.ico` 404 (D-04) |
| `/en-GB` | 200 | en-GB | dark | same | clean |
| `/en-GB/login` | 200 | en-GB | dark | "Sign in \| InvestFund" | clean |
| `/en-GB/app` | 200 | en-GB | dark | "Dashboard \| InvestFund"; **no dev badge** | clean |
| `/en-GB/dev/ui` | 404 (showcase excluded from production) | – | – | – | – |
| `/en-GB/does-not-exist` | 404 | en-GB | dark | "Page not found" | expected 404 resource log |
| `/en-GB` after `localStorage.theme=light` | 200 | en-GB | **light** | – | clean |

Each page has exactly one `<main>` and one `h1`. Every route, including the 404 and the redirect, sends CSP with `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and `Permissions-Policy`, with no `X-Powered-By`. The production CSP keeps `script-src 'unsafe-inline'` (D-05).

A DOM-ready proxy for load timing gave 22–55 ms locally. This is not an LCP measurement; Lighthouse CI is deferred.

A second build with `INVESTFUND_DEV_UI=true` and `NEXT_PUBLIC_API_URL=http://127.0.0.1:4100` was run against the live API. The badge on `/en-GB/app` showed **ready**: a cross-origin `GET /health/ready` with CORS and CSP `connect-src` working end to end. The showcase rendered without console errors.

Accessibility: **no axe scan was run** (no Playwright or axe here). Landmarks, `lang` and the polite `role="status"` region of the badge were checked structurally only.

### 5.3 Security and dependencies

- `pnpm audit --audit-level high`: no known vulnerabilities. A full audit also reports none.
- CI workflow: least privilege (`contents: read`), SHA-pinned actions and no secrets (CI-01 AC5).
- R0 has no authentication, upload or AI endpoints. The OWASP API Top 10 IDOR, authz-matrix and prompt-injection suites become applicable in R1 (S1.2, S1.5, S1.9) and R2.

## 6. Invariants (`docs/TEST_STRATEGY.md`)

| # | Invariant | R0 status |
|---|---|---|
| 1 | No email or calendar event without an approved ApprovalRecord | n/a. No send path exists. The mock Google `/__calls` recorder is ready (MOCK-02). |
| 2 | Investors never receive gated startup fields before connection | n/a. No startup data exists yet (R1 S1.5 and S1.9). |
| 3 | Uploaded documents cannot trigger tool calls beyond drafting | n/a (R2) |
| 4 | Secrets and tokens never appear in responses or logs | **Verified for the R0 surface**: config errors give names only; the key ring serialises to versions only (`cipher.test.ts`); tokens are never logged (`auth-guards.int.test.ts`, plus a live grep for the token); problem bodies carry no stack or cause; DB query logs carry no parameters (`prisma.int.test.ts`); a live log grep found no secrets. |

## 7. Deviations and deferrals across R0

| Item | Source | Target |
|---|---|---|
| Coverage measurement and thresholds (`@vitest/coverage-v8` needs Gate X); CI-01 AC2; coverage in the job summary | CI-01, API-02 deviation 4, TEST-01 | P0-TEST-01, early R1 |
| Playwright, axe and the `e2e-smoke` CI job (WEB-01 AC1/2/6, WEB-02 AC2/4/5/6, TEST-01 AC5) | PHASE_PLAN R0 note, CI-01 | R1 S1.11 |
| Testcontainers replaced by per-suite databases on an existing server; `test:unit` / `test:int` split; faker factories; `signTestToken`; `TEMPLATE.md` | DB-01, TEST-01 | R1 (TEST-01 remainder) |
| Single `test` job using a `services:` container instead of separate `unit` and `integration` jobs | CI-01 | Accepted |
| Docker Compose runtime ACs (INFRA-01 AC1, AC3, AC5), start-up time, sandbox smoke (P0-TEST-02) | INFRA-01, TEST-02 | R2 |
| Worker and BullMQ (P0-API-03); Redis left out of readiness | PHASE_PLAN | R2 |
| Mock LLM and mock Google parked; official `openai` and `googleapis` client tests are `todo` | MOCK-01/02 | R2 (LLM), R5/R6 (Google) |
| Marketing shell (P0-WEB-03) | PHASE_PLAN | R1 S1.10 |
| `auth` 5/min per email, `upload` 500 MB/hour, monthly AI quotas | API-02 deviation 3 | S1.2, S1.5, R2 |
| `core/file-storage` instead of `core/storage` (because of the `.claude/settings.json` read rule) | API-02 deviation 1 | Human settings decision |
| `StorageProvider.put` returns `{ key, sizeBytes }` | API-02 deviation 2 | Accepted |
| Prisma 6.19.3 (7.x needs adapter dependencies); `deepmerge-ts` 8.0.2 override for the audit | DB-01, CI-01 | Remove the override when Prisma depends on deepmerge-ts ≥ 8 |
| `prom-client` 15.1.3 is deprecated on npm | API-01 Q2 | Separate dependency decision |
| `next typegen` must run before `pnpm lint` on a fresh checkout (CI does this; locally lint fails without it) | CI-01 | Frontend follow-up: add a `typegen` script or a lint pre-step |
| MSW worker file generated on demand (`msw:init`), not committed | WEB-04 | Accepted |
| Branch protection on `main` (required checks `lint`, `test`, `build`, `audit`) | CI-01 | Human, GitHub settings |

## 8. Defects

| ID | Severity | Owner | Summary | Steps to reproduce | Proposed fix |
|---|---|---|---|---|---|
| D-01 | Medium | backend (INFRA-01), frontend (web image) | **The documented sandbox profile cannot start.** `README.md` (Profiles) documents `docker compose … --profile sandbox up -d --build`. However, `apps/web/Dockerfile` does not exist, and the `worker` service runs `node dist/worker.js`, which is not built because P0-API-03 is deferred to R2. A build or a crash loop will fail. | `ls apps/web/Dockerfile` → missing. `grep worker.js infra/docker-compose.yml` → `command: ['node','dist/worker.js']`. `pnpm check:compose` → "apps/web/Dockerfile does not exist yet (skipped)". | Mark the sandbox profile as "available from R2" in the README and the compose comment, and either move `worker` to its own `worker` profile until API-03 lands or remove it until then. Add a web Dockerfile card before any release that runs E2E against the sandbox. No blocker for R0 or R1 (S1.11 can run Playwright against `next start` and the API). |
| D-02 | Low | orchestrator / supervisor (docs) | **Task-status drift.** `docs/tasks/p0/README.md` lists P0-WEB-04 as `in-review` with no commit, but it is committed in `d0c386a`. The P0-WEB-04 card says "Status: in-review". The P0-API-02 card header says "Status: in-review" (the README says committed `6d1c5a4`). The Commit column is empty for REPO-01 (`08fe28f`), SHARED-01 (`4dc4995`), INFRA-01 (`a6c6b24`), WEB-01 (`acf4206`). | Read the files listed. | Update the statuses and commit hashes in the release PR (docs only). |
| D-03 | Low | tester (TEST-01), with a CI change behind Gate X | **Tooling ACs with no automated regression test:** REPO-01 AC3 (`no-explicit-any`), REPO-01 AC5 / the `check-eol` CRLF fixture (the card requires one), INFRA-01 AC4 (`check:compose` and its negative fixture are not run in CI or in Vitest), REPO-01 AC7 (untracked artefacts). All pass when checked by hand. | `grep -rn "check-eol\|check-compose\|no-explicit-any" **/*.test.ts` → no hits | Add Vitest tests modelled on `raw-unsafe-lint.test.ts`: an `any` fixture; spawn `check-eol` on a temporary repo with a CRLF blob; spawn `check-compose --file fixtures/compose-violations.yml` and expect exit 1. Add `pnpm check:compose` to the CI `lint` job (Gate X). |
| D-04 | Low | frontend | **No favicon:** `/favicon.ico` → 404, so a console error appears on the first load of every page and will show up in later axe/console-clean E2E checks. | Chromium on `/` → "Failed to load resource: 404" for `/favicon.ico` | Add `src/app/icon.svg` (or `favicon.ico`) from the Logo mark. This fits S1.10. |
| D-05 | Low (risk) | frontend | **The production CSP allows `script-src 'unsafe-inline'`.** This weakens the XSS protection that the CSP baseline is meant to give. It is needed today for the next-themes blocking script and Next's inline bootstrap. | `curl -sI /en-GB` | Move to a nonce-based CSP through the Next proxy/middleware (`'nonce-…' 'strict-dynamic'`) before user-generated content arrives (S1.6 or S1.9), or record an accepted-risk decision. |
| D-06 | Info | frontend | The badge's accessible text joins as "API: ready(127.0.0.1:4100)" with no space (visually spaced by a flex gap). | `textContent` of `[data-testid=api-status-badge]` | Add a literal space or a `sr-only` separator. Dev-only UI. |
| D-07 | Info | backend | (a) The JSON body parser runs before routing, so malformed JSON sent to `/health/live` or to unknown paths gets 400 instead of 404/405. This is harmless. (b) The "readiness check failed" `warn` line has no `req.id`, so it cannot be correlated with the 503 request line. | `curl -X POST -H 'Content-Type: application/json' --data '{"a":' /health/live` → 400 | Optional: pass the request logger into the readiness registry. Leave (a) as is. |

There are no critical or high defects, and no AC failed.

## 9. Open risks for R1

| ID | Risk | Mitigation |
|---|---|---|
| R-01 | The CI result on GitHub has never been observed from an agent session (CI-01 AC1/3/4/6 and the integration requirement). | Human checks the run for `d0c386a` before Gate C. Configure branch protection with the four required checks. |
| R-02 | **No coverage measurement.** R1 adds the first `src/modules/**` code with an 80% DoD threshold that cannot be checked. | Ask for Gate X approval of `@vitest/coverage-v8` at the start of R1 (S1.1) and wire the thresholds into CI. |
| R-03 | No E2E or axe until S1.11, while S1.3–S1.10 build most of the UI, so accessibility and journey regressions accumulate. | Bring the Playwright and axe setup (the TEST-01 remainder) forward to around S1.3 and grow the smoke suite with each UI session. |
| R-04 | Integration tests need a reachable Postgres. There is no Testcontainers path for contributors without a local server. | Keep the `TestDatabaseServer` seam. Add the Testcontainers starter once it is approved and Docker Hub access works. |
| R-05 | Local pgvector 0.6.0 differs from CI 0.8.7. | Not an issue until vector columns arrive (R3). Align the dev setup then. |
| R-06 | The rate limiter fails closed, so a database outage returns 503 on every limited route (verified). This is intended. | Document it in the runbook. Alert on `dependency-unavailable` rates. |
| R-07 | Auth is still open: the per-email `auth` limit, refresh-cookie flags, IDOR and the authz matrix. | Cover these in S1.1–S1.2 integration tests (skill `nonfunctional-testing`). |
| R-08 | The sandbox is not runnable (D-01), and `web` in the sandbox has egress (from the earlier review). | Plan it before R2, when the mocks come back into use. |
| R-09 | Pinned dependency debt: Prisma 6 plus the `deepmerge-ts` override, and `prom-client` deprecated. | Track in DECISIONS_LOG. Re-audit at each release end. |

## 10. Reproduction notes

- Fresh clone: `git clone <repo> && git checkout d0c386a && pnpm install --frozen-lockfile`, then the commands in §3 with `NEXT_PUBLIC_API_URL=http://localhost:4000` and `DATABASE_URL=TEST_DATABASE_URL=postgresql://investfund:investfund@localhost:5432/<new empty db>`.
- API smoke: `node apps/api/dist/server.js` with `DATABASE_URL`, random `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY` (32 random bytes, base64), `ENCRYPTION_KEY_VERSION=1`, random `IP_HASH_SECRET`, `WEB_URL`, `API_PORT=4100` and `METRICS_PORT=9564`. Probe with `curl`. For the DB-down check, use `pg_ctlcluster 16 main stop`, probe, then `pg_ctlcluster 16 main start`.
- Web smoke: `next start --port 3100` on the production build. Chromium headless through CDP (no new dependencies) collected console errors, network status, the `<html>` attributes, the badge state and screenshots.
