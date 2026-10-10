# Supervisor standards review: Phase 0, wave 2

Date: 2026-10-09 · Branch: `feature/p0-foundations` · Reviewer: Supervisor
Scope: uncommitted working tree (tracked diff + untracked files) for P0-SHARED-01, P0-INFRA-01, P0-WEB-01.
Checklist: `.claude/skills/code-review-standards/SKILL.md`, `CLAUDE.md` §5 and §7, `docs/API.md` §1–§3 and §5.

Verification inputs: orchestrator reports exit 0 for `pnpm install --frozen-lockfile`, lint, typecheck,
format:check, test (120 passing), check:eol, check:compose and the web production build. During this review
I also checked, without starting Docker:

- `node infra/scripts/check-compose.mjs --file infra/scripts/fixtures/compose-violations.yml` exits 1 and
  reports all 6 expected problems, so the negative fixture works.
- `apps/web/.next/routes-manifest.json` contains the full security-header set, with the API origin in
  `connect-src`. Headers are fixed at build time, so `next start` does not need `NEXT_PUBLIC_API_URL`.
- Docker Hub lists all three pinned tags as active: `pgvector/pgvector:0.8.7-pg16`,
  `redis:7.4.11-alpine` and `axllent/mailpit:v1.31.4`.
- Next 16.4 passes both `reset` and `retry` to error boundaries, so `ErrorStateProps.retry` is correct.

---

## Review P0-SHARED-01: CHANGES REQUIRED

**Blocking**

1. `apps/web/package.json:13-21` → AC6 is not met. `apps/web` does not depend on or import `@investfund/shared`, and
   `apps/api` has no source yet, so neither app proves it can resolve the package. **Required fix:** add
   `"@investfund/shared": "workspace:*"` to `apps/web` dependencies. This is a workspace package, so no Gate X is
   needed. Then add a small consumer test, for example `apps/web/test/shared-contract.test.ts`, that imports
   `Money`, `formatMoney` and `ProblemDetails` from `@investfund/shared` (no `@/` or `src/` path) and parses or
   formats one value. `pnpm typecheck`, `pnpm test` and `pnpm --filter web build` must still pass. This proves
   resolution through the `exports` map with `moduleResolution: Bundler` and through the Next bundler.
   The frontend agent owns the file, but the fix closes a SHARED-01 criterion. I accept moving the `apps/api` half to
   P0-API-01, whose error handler and health route must import `ProblemDetails` and `HealthReport` from the
   package (NodeNext resolution). That card's reviewer will check it.

**Contract review (passes)**

- Naming matches `docs/API.md`: `ProblemDetails`, `Money`, `CursorPageQuery`, `CursorPage<T>`/`cursorPage()`,
  `JobAccepted`, `Job`, `AcceptedMessage`, `HealthReport`. Every component uses a PascalCase const with a type of the
  same name and has `.meta({ id })`.
- `ProblemDetails` (`common.ts:91`) has the RFC 9457 members plus `requestId` (required) and
  `errors[{path,code,message}]`. Response schemas are non-strict, as the card's notes allow.
- `Money` (`common.ts:65`) is strict and uses a digit string with no sign or leading zeros, capped at BIGINT max, and
  `GBP` only. AC1 is covered, including `25.5`, `"-1"` and `USD`.
- `CursorPageQuery` (`common.ts:129`) is strict, with limit coerced to 1–100 and a default of 20 (AC2). The cursor
  is base64url with a maximum of 512 characters.
- Money helpers use only string and digit arithmetic. `formatMoney` passes a decimal string to `Intl.NumberFormat`,
  and a test covers BIGINT max exactly. The seeded property test runs 1 000 round-trips (AC3, AC4).
- Problem slugs and statuses, and the rate-limit preset names, are checked against `docs/API.md` §2 and §3 by parsing
  the Markdown. This is a good drift guard.
- OpenAPI: `generate-openapi.mjs` builds from `dist`, and keys are sorted for byte-identical output. The committed
  `openapi.json` is compared in a test, components and paths are snapshotted, and a structural 3.1 check finds no
  dangling `$ref`s (AC5). No validator dependency was added, which is acceptable.
- `index.ts` keeps the generator out of browser bundles through the separate `./openapi` export and
  `sideEffects: false`.

**Non-blocking**

- `src/api/common.ts:195`: `Job.type` is a free string. `DATABASE.md` §3 already fixes `JobType`, so a
  `JobType` enum could be exported now. Narrowing a response field later is non-breaking, so deferring it to the jobs
  contract (P2) is acceptable.
- `src/openapi/document.ts:44-83`: the document has no `servers`, and paths are absolute (`/health/*`,
  `/api/v1/openapi.json`). `docs/API.md` omits `/api/v1` for domain paths, so later contract cards will need one rule.
  Either register full `/api/v1/...` paths or add `servers: [{ url: '/api/v1' }]` and keep `/health` outside it.
  Record the chosen rule in a comment now so P1 does not mix the two.
- `package.json` `exports` resolve only to `dist`, and `prepare` builds on install. App type checks therefore use
  stale types until the shared package is rebuilt. Consider a `"development"`/source condition or a
  `pnpm --filter shared build --watch` note in the README. Any later Dockerfile must copy `packages/shared` before
  `pnpm install`, or `prepare` will fail.
- The `/api/v1/openapi.json` 429 response does not declare the `Retry-After`/`RateLimit-*` headers. Add them when
  P0-API-02 defines the rate-limit headers.
- `docs/API.md` §5 names `HealthReport` but gives no shape. The proposed shape is
  `{ status: ok|fail, checks: [{ name, status }] }`, with no error details because the body is public. It fits
  P0-API-01 AC9 and I endorse it, but the API doc should be updated (see H4).

## Review P0-INFRA-01: PASS (conditional on H2 and H3)

What the card asks for and what is delivered:

- Postgres, Redis and Mailpit use exact tags and have healthchecks. The Postgres healthcheck uses TCP, so it stays red
  while init scripts run. Redis has AOF and `noeviction` for BullMQ.
- All published ports are bound to `127.0.0.1`, data is in named volumes, and `01-extensions.sql` creates `vector`
  and `citext`.
- The `sandbox` network is `internal: true`, and `api` and `worker` are attached only to it.
- `check-compose.mjs` covers AC4 and sandbox isolation, and its negative fixture works.
- `compose-health.mjs` takes a timeout, reports timing and checks the extensions (AC2).
- `.dockerignore` excludes `.env*` and `docs`.
- The README documents up, down, logs and Windows/WSL2.

Deferred, which needs the human decisions below:

- **AC1:** the mocks are behind a `mocks` profile until P0-MOCK-01/02 land.
- **AC3:** the sandbox egress test is not done.
- **Scope:** the multi-stage Dockerfiles for `apps/api` and `apps/web` do not exist, because the node base image is
  not approved and the API has no code yet.
- **AC5 and start-up time:** not exercised, because Docker was not started. They must be run before the phase report.

These deferrals follow from missing approvals and dependencies, not from defects. The code that exists is correct.

**Blocking:** none, provided H2 and H3 are approved. If H3 is refused, this card becomes CHANGES REQUIRED.

**Non-blocking**

- `infra/docker-compose.yml:137`: the comment assigns the Dockerfiles to P0-API-01 and P0-WEB-01, but they are
  INFRA-01 scope. Fix the comment once H3 decides the owning card.
- `README.md:77-78`: the documented `--profile mocks` and `--profile sandbox` commands fail today because the
  Dockerfiles do not exist yet. Mark them "available after P0-MOCK-01/02 / the Dockerfile card".
- `infra/docker-compose.yml:234`: `web` joins the egress-capable `default` network so that its port can be published.
  Its SSR therefore has egress, and the card asks for the app containers to have none. This is acceptable for the
  sandbox, but say so in the README. The alternative is a published reverse proxy on `default` in front of an
  internal-only `web`.
- Sandbox OAuth: the browser is redirected to `GOOGLE_AUTH_BASE_URL=http://mock-google:4020`, which the host browser
  cannot resolve. P0-MOCK-02 and P0-TEST-02 should use `http://localhost:4020` for browser-facing URLs and the service
  name only for server-to-server calls.
- `infra/docker-compose.yml:148,168-170`: the sandbox runs `NODE_ENV=production` with known throwaway secrets.
  If P0-API-01/02 add a "reject default secrets in production" guard, the sandbox will break. Plan an
  `APP_ENV=sandbox` (or similar) switch in P0-API-01's config schema.
- Add a Vitest/CI check that runs `check-compose.mjs` against `fixtures/compose-violations.yml` and expects exit 1,
  so the negative path stays tested. This fits P0-CI-01.

## Review P0-WEB-01: PASS (conditional on H1)

Acceptance criteria:

- **AC1:** `proxy.ts` uses the next-intl middleware with `localePrefix: 'always'`, and the placeholder pages exist.
  The E2E check is P0-TEST-01.
- **AC2:** `ThemeProvider` has `attribute="class"`, `defaultTheme="dark"` and `enableSystem`, and
  `suppressHydrationWarning` is set. A test checks that the blocking script is injected. There is no toggle UI yet;
  the persistence E2E needs a toggle from WEB-02/03.
- **AC3:** an ESLint `no-restricted-syntax` guard has positive and negative fixtures and a test that the guard is
  active in the repo config.
- **AC4:** `next.config.ts` validates the env in the build and dev phases, and a unit test checks this.
- **AC5:** a unit test checks the headers, and the built manifest confirms them.
- **AC6:** `[...rest]` plus a localised `not-found`.
- TanStack defaults match the card (queries retry 1, mutations retry false, no focus refetch), with one client per
  request.
- Inter comes from `next/font`.
- All strings are in `en-GB.json`, with typed message keys.
- The error boundary logs only the digest, with no PII.

**Blocking:** none.

**Non-blocking**

- `src/lib/security-headers.ts:25`: `script-src 'unsafe-inline'`. This is acceptable as a P0 baseline because
  next-themes and RSC inline scripts need it. Track the nonce-based CSP as an explicit card before any authenticated
  page ships (P1), and record it in the phase risk list. Add `Strict-Transport-Security` at the production edge later.
- `next.config.ts:16-34`: replacing `next-intl/plugin` with a manual alias is reasonable and documented. Add a unit
  assertion that `turbopack.resolveAlias['next-intl/config']` points to an existing file, so a next-intl upgrade that
  changes the plugin is caught. Re-test with the plugin on Linux CI later. The root cause is local to this machine.
- The `allowBuilds` entries in `pnpm-workspace.yaml` (`@swc/core`, `esbuild` and `@parcel/watcher` set to `false`)
  are repository-wide. They are harmless today because the prebuilt binaries come from optional dependencies, but
  they were added as a workaround for one Windows host. Keep them and add a comment explaining why.
- `.env.example:8` puts `NEXT_PUBLIC_API_URL` in the root file, but Next reads only `apps/web/.env*`. The README says
  this, but add a one-line note in `.env.example` too.
- The i18n guard covers only `src/**/*.tsx` JSX. String literals in `metadata` objects and `.ts` helpers are not
  checked. That is acceptable for now; extend the guard when WEB-03 adds real copy.
- The `not-found.tsx` files in the route groups are reachable only through `notFound()` inside those groups.
  They are harmless but redundant with `[locale]/not-found.tsx`. The card asks for them, so keep them.

## Shared files touched by both agents

- `eslint.config.mjs`: the refactor keeps the Prisma raw-SQL ban, and the web override repeats it because flat
  config replaces rule options. This is correct.
- `.prettierignore`: excludes the generated `openapi.json` (the test compares it byte-for-byte) and `next-env.d.ts`.
  This is fine.
- `package.json`: adds the `infra:*` and `check:compose` scripts. This is fine.
- `pnpm-workspace.yaml`: see the note on `allowBuilds` above.
- The changes are consistent. They should be committed together with whichever card goes first, or split per
  card (see H6).

## Items needing human decision

- **H1, Gate X for dependencies.** `apps/web` uses `@tailwindcss/postcss@4.3.3`, `@types/react@19.3.0`,
  `@types/react-dom@19.3.0` and `@types/node@22.20.5`. They are not on the P0 list but are required by the approved
  `tailwindcss` v4, `react` and Node. I recommend approving them. The proposed `jsdom`, `@testing-library/dom` and
  `eslint-plugin-react-hooks` are not installed. `jsdom` and `@testing-library/dom` are runtime peers of the approved
  `@testing-library/react`. `eslint-plugin-react-hooks` is a useful lint addition. I recommend approving all three in
  the P0-TEST-01 request. **No commit of P0-WEB-01 before H1.**
- **H2, Docker image pins.** `pgvector/pgvector:0.8.7-pg16`, `redis:7.4.11-alpine` and `axllent/mailpit:v1.31.4`
  are exact versions within the approved `pg16`, `redis:7` and `mailpit` lines. All three tags exist on Docker Hub.
  The card requires pinning. I recommend confirming them. Optionally pin by digest later in CI.
- **H3, INFRA-01 deferrals.** The human must decide whether to accept:
  - **AC1 (mocks healthy on a plain `up`):** moved to P0-MOCK-01/02.
  - **AC3 (sandbox egress test) and the api/web Dockerfiles:** moved to a follow-up once these are ready: the Node
    base image (needs Gate X, for example a pinned `node:22.x-alpine`), the API code (P0-API-01) and the web
    Dockerfile.
  - **AC5 persistence and the start-up timing:** run once Docker is allowed.

  The Supervisor will update the task cards to match the decision.
- **H4, `HealthReport` shape and `Job.type` as a string.** Approve `HealthReport` as
  `{ status: 'ok'|'fail', checks: [{ name, status }] }` and add it to `docs/API.md` §5. Approve keeping `Job.type` as
  a string until the P2 jobs contract.
- **H5, CSP `'unsafe-inline'`.** Accept it for P0, with nonce-based CSP hardening as a tracked P1 card.
- **H6, commit split.** Three Conventional Commits are suggested, one per card. The shared root files go with
  SHARED-01, which comes first. Commit after the SHARED-01 blocking fix and H1.
