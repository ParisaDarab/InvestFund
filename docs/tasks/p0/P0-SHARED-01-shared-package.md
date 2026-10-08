# P0-SHARED-01: Shared contracts package and OpenAPI generator
Owner: backend        Estimate: M
Requirements: NFR-MAINT-01, NFR-SEC-01 (input validation)
Depends on: P0-REPO-01

## Goal
Create `packages/shared` as the single source of truth for API contracts: Zod schemas used by both apps and exported to OpenAPI 3.1. Phase 0 defines only the cross-cutting schemas that every later contract builds on.

## Scope
- In: package build (ESM + type declarations) and `exports` map, published in the workspace as `@investfund/shared`; `src/api/common.ts` with `ProblemDetails` (RFC 9457 + `requestId`, `errors[{ path, code, message }]`), `Money` (`amountMinor` digit string, `currency` = `GBP`), `CursorPageQuery`, a `cursorPage(schema)` helper, `JobAccepted`, `Job`, `AcceptedMessage`, `Uuid`, `IsoDateTime`, `IsoDate`; `src/api/system.ts` with `HealthReport`; `src/constants/problem-types.ts` (the slugs in `docs/API.md` §2); `src/constants/rate-limits.ts` (preset names `auth`, `upload`, `ai`, `sensitive`, `default`); an OpenAPI registry (`@asteasolutions/zod-to-openapi`) and `pnpm --filter shared openapi:generate` writing `packages/shared/openapi/openapi.json`; money helpers `toMinor` and `formatMoney` (en-GB, `Intl.NumberFormat`) that never use floating-point arithmetic.
- Out: domain schemas (auth, startups and so on, in later contract cards); the API route that serves the document (P0-API-01).

## Contracts / inputs
- Endpoints: none (provides schemas for `GET /health/ready` and `GET /api/v1/openapi.json`)
- Schemas: `packages/shared/src/api/common.ts` → `ProblemDetails`, `Money`, `CursorPageQuery`, `JobAccepted`, `Job`, `AcceptedMessage`; `packages/shared/src/api/system.ts` → `HealthReport`
- Tables: none

## Acceptance criteria
1. Given `Money.parse({ amountMinor: "2500000", currency: "GBP" })`, When parsed, Then it succeeds; Given `amountMinor: 25.5`, `"-1"` or `currency: "USD"`, Then parsing fails.
2. Given `CursorPageQuery.parse({ limit: "500" })`, When parsed, Then it fails (maximum 100); Given `{}`, Then `limit` defaults to 20.
3. Given `toMinor("1250.50")`, When called, Then it returns `"125050"`, and a property-based test over 1 000 random two-decimal strings round-trips exactly through `toMinor` and back.
4. Given `formatMoney({ amountMinor: "125050", currency: "GBP" })`, When called with locale `en-GB`, Then it returns `£1,250.50`.
5. Given `pnpm --filter shared openapi:generate`, When run twice, Then it writes byte-identical, valid OpenAPI 3.1 JSON containing the `ProblemDetails` and `HealthReport` components.
6. Given `apps/api` and `apps/web` import `@investfund/shared`, When `pnpm typecheck` runs, Then both resolve the types without path aliases into `src/`.

## Test requirements
- Unit: every schema with valid and invalid fixtures; money helpers including the property-based round-trip; the problem-type slug list matches `docs/API.md` §2.
- Integration: OpenAPI generation snapshot test (stable ordering) and a structural validation of the output.
- E2E / non-functional: none.

## Notes / risks
- Request schemas use `.strict()`. Response schemas may stay non-strict for forward compatibility.
- If an OpenAPI validator library is needed, add it to the Gate X request.
