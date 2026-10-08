# P0-WEB-04: Typed API client foundation and MSW setup
Owner: frontend        Estimate: S
Requirements: NFR-MAINT-01, NFR-SEC-01
Depends on: P0-WEB-01, P0-SHARED-01, P0-API-01

## Goal
One typed way for the web app to call the API, so that every feature uses the shared Zod schemas, handles problem+json errors consistently and can be tested with MSW instead of a live backend.

## Scope
- In: `src/lib/api/client.ts` (`apiFetch(path, { method, body, schema })` that prefixes `NEXT_PUBLIC_API_URL` + `/api/v1`, sends JSON, sends `credentials: "include"` only for `/auth/*`, attaches a bearer token from an injectable token provider (implemented in P1), parses success bodies with the response schema, and parses errors into a typed `ApiError` built from `ProblemDetails`); mapping of `errors[]` onto React Hook Form fields (`applyProblemToForm`); a TanStack Query helper for query keys; a `useHealth()` example hook calling `GET /health/ready` through a small proxy-safe path; MSW handlers directory with a `health` handler, browser worker for dev opt-in and node server for tests; a dev-only status badge in the app shell that shows API readiness.
- Out: authentication and token refresh (P1); domain hooks.

## Contracts / inputs
- Endpoints: `GET /health/ready` (docs/API.md §5)
- Schemas: `packages/shared/src/api/common.ts` → `ProblemDetails`; `packages/shared/src/api/system.ts` → `HealthReport`
- Tables: none

## Acceptance criteria
1. Given MSW returns a valid `HealthReport`, When `useHealth()` runs, Then the data is typed and the badge shows "ready".
2. Given MSW returns a body that does not match the response schema, When the client parses it, Then it throws a typed `ApiError` with `kind: "contract"` and the error is logged to the console in development only.
3. Given MSW returns 400 problem+json with `errors[{ path: "email", ... }]`, When `applyProblemToForm` is used with a React Hook Form instance, Then the `email` field shows the message and receives focus.
4. Given MSW returns 429 with `Retry-After: 30`, When the client handles it, Then `ApiError.retryAfterSeconds` is 30.
5. Given a network failure, When a query runs, Then it surfaces `ApiError` with `kind: "network"` and is retried once.

## Test requirements
- Unit: client parsing paths (success, contract violation, problem+json, 429, network) with MSW node server; form mapping helper.
- Integration: the web app builds with the client imported in a server component and a client component.
- E2E / non-functional: covered by the P0 smoke (badge shows ready against the real API).

## Notes / risks
- Never log tokens or response bodies containing personal data.
