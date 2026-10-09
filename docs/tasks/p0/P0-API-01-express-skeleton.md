# P0-API-01: Express API skeleton, config, logging, errors and health
Owner: backend        Estimate: M
Requirements: NFR-OBS-01, NFR-MAINT-01, NFR-SEC-01
Depends on: P0-REPO-01, P0-SHARED-01

## Goal
A running, observable Express API with the layering and plumbing every module reuses: validated configuration, structured logs with request IDs, RFC 9457 errors and health endpoints.

## Scope
- In: `apps/api/src/app.ts` (`createApp(deps)` factory, free of side effects, for tests); `src/server.ts` (HTTP entry, graceful shutdown on SIGTERM and SIGINT); `src/core/config` (Zod-validated env; fails fast listing missing variable **names**, never values); `src/core/logger` (pino + pino-http, request ID taken from `X-Request-Id` or generated, redaction of `authorization`, `cookie`, `password`, `token`, `apiKey`, `refreshToken` paths); `src/core/errors` (`DomainError` base plus `ValidationError`, `NotFoundError`, `ForbiddenError`, `ConflictError`, `BusinessRuleError`, `RateLimitError`, `DependencyUnavailableError`; a central handler mapping them to `ProblemDetails`; unknown errors become 500 with no stack in the body); `src/core/http` (`asyncHandler`, problem+json 404 fallback); `src/core/container.ts` (composition root); `GET /health/live`; `GET /health/ready` with a check registry (db, redis and storage checks are registered by later cards); `GET /metrics` (prom-client defaults and an HTTP duration histogram, served on a separate internal port or disabled by config); `GET /api/v1/openapi.json`; `apps/api/README.md` describing the `src/modules/<domain>/` convention (routes → controller → service → repository).
- Out: security middleware, rate limits, crypto and storage (P0-API-02); the worker (P0-API-03); Prisma (P0-DB-01); any domain module.

## Contracts / inputs
- Endpoints: `GET /health/live`, `GET /health/ready`, `GET /metrics`, `GET /api/v1/openapi.json` (docs/API.md §5)
- Schemas: `packages/shared/src/api/common.ts` → `ProblemDetails`; `packages/shared/src/api/system.ts` → `HealthReport`
- Tables: none

## Acceptance criteria
1. Given the API is running, When `GET /health/live` is called, Then it returns 200 `{ "status": "ok" }` with an `X-Request-Id` header.
2. Given a request with `X-Request-Id: abc-123`, When any endpoint responds, Then the response echoes that ID and the pino log line for the request contains it.
3. Given a route throws `NotFoundError`, When called, Then the response is 404 `application/problem+json`, parses with `ProblemDetails` and includes `requestId`.
4. Given a route throws `new Error("boom")`, When called, Then the response is 500 problem+json with a generic `detail` and no stack trace, and the log contains the stack.
5. Given `JWT_ACCESS_SECRET` is unset, When the server starts, Then it exits non-zero and the message names the variable without printing any values.
6. Given a log call with `{ password: "x", headers: { authorization: "Bearer y" } }`, When written, Then both values appear as `[Redacted]`.
7. Given an unknown path `/api/v1/nope`, When called, Then the response is 404 problem+json.
8. Given SIGTERM arrives during an in-flight request, When the server shuts down, Then the request completes and the process exits 0 within 10 s.
9. Given a registered readiness check that fails, When `GET /health/ready` is called, Then it returns 503 with a `HealthReport` naming the failing check and no internal error details.

## Test requirements
- Unit: config parsing (valid, missing, malformed), error mapping per error class, logger redaction.
- Integration: Supertest against `createApp()` for every criterion above.
- E2E / non-functional: `GET /health/live` p95 < 20 ms locally (recorded, not gating).

## Notes / risks
- Coverage ≥ 80% for `apps/api/src/core/**` added here.
- Do not expose `/metrics` publicly; document the internal port.

## Review decisions (supervisor, 2026-10-09)
- **Q1, 500 problem type:** unknown errors use the standard slug `internal-error` (500, title `Internal server error`) added to `docs/API.md` §2. Add it to `PROBLEM_TYPE_STATUS` (`packages/shared/src/constants/problem-types.ts`) and `PROBLEM_TITLES`, and make `buildProblem` take a `ProblemTypeSlug` only (drop the `null` / `about:blank` branch and the `INTERNAL_PROBLEM_TYPE` / `INTERNAL_PROBLEM_TITLE` constants). Keep `INTERNAL_PROBLEM_DETAIL`. Do not add an `InternalError` domain class. The shared docs-sync test fails until this lands.
- **Q2, prom-client:** keep `prom-client@15.1.3` for P0 (pinned, on the approved list, isolated in `core/metrics` behind `HttpMetrics`). Its npm deprecation is recorded for the human; a switch to `@prometheus-io/client` (currently 0.x) needs its own dependency approval and is not part of this card.
- **Q3, openapi.json:** confirmed as implemented for this card (fails closed in production). The production admin guard and the start-up warning are added by P0-API-02 (see its AC10–AC11 and `docs/API.md` §5).
- **Q4, config scope:** confirmed. This card validates `JWT_ACCESS_SECRET` only. Each later card adds the variables it consumes to `EnvSchema` (P0-API-02, P0-DB-01, P0-API-03 list theirs in Notes).
- **Q5, module mounting:** confirmed. Modules are built in `core/container.ts` and passed to `createApp` as `ApiModule { path, router }`; `app.ts` mounts them under `/api/v1` and is not edited per module (skill `express-module` and `docs/ARCHITECTURE.md` updated).
- **Metrics route label (review finding 1):** when a module route throws, Express has already restored `req.baseUrl` by the time `finish` fires, so the label loses its mount path (`route="/:itemId"` instead of `/api/v1/items/:itemId`). Capture the mount path while the request is inside the mounted router (for example a tiny middleware placed before each module router and before the health router that stores `req.baseUrl` in `res.locals`) and build the label from it. Add an integration test for a throwing route.
