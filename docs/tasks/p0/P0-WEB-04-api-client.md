# P0-WEB-04: Typed API client foundation and MSW setup
Owner: frontend        Estimate: S        Status: in-review (R0 S0.5)
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

## Implementation (R0 S0.5, 2026-10-10, in-review)

- `apps/web/src/lib/api/client.ts`: `apiFetch(path, { method, body, schema, headers, signal, prefix, acceptStatuses })`
  with overloads (typed `z.output<Schema>` with a schema, `undefined` without). Builds
  `NEXT_PUBLIC_API_URL` + `/api/v1` + path (`buildApiUrl`, root-relative paths only), sends JSON with
  `Accept: application/json, application/problem+json`, `credentials: 'include'` only for `/auth`
  and `/auth/*` (`omit` otherwise). Bearer token from `setAccessTokenProvider()` (no-op until P1),
  consulted in the browser only so a module-level token can never leak between server requests.
  `ApiError { kind: 'problem' | 'http' | 'contract' | 'network', status, problem, fieldErrors,
  retryAfterSeconds, requestId, issues, method, endpoint }`; `endpoint` drops the query string.
  `Retry-After` accepts delta-seconds and IMF-fixdate. Contract violations are logged with
  `console.error` only when `NODE_ENV === 'development'`, with the endpoint and Zod issue
  path/code/message, never the body, headers or query. Aborts rethrow the original `AbortError`.
- **`/health/ready` is not under `/api/v1`** (the API mounts `/health` at its root, `apps/api/src/app.ts`).
  `apiFetch` takes `prefix: false` for these system endpoints. The "proxy-safe path" is read as: the
  web app calls the API origin directly (CORS allows `WEB_URL`, CSP `connect-src` already has the API
  origin); no Next.js rewrite/proxy route was added. The API answers `503 HealthReport` when a
  dependency is down, so `acceptStatuses: [503]` parses it as data instead of throwing.
- `lib/api/problem-form.ts`: `applyProblemToForm(error, form, { fields? })` maps `errors[].path`
  (`email` or `body.email`; nested `body.a.0.b` -> `a.0.b`) to `setError` with `shouldFocus` on the
  first field, one message per field; `query.*`, `params.*`, `headers.*` and whole-body errors are
  returned as `unmatched` for a summary/toast.
- `lib/api/query.ts`: `createQueryKeys(domain)` (`all`, `lists`, `list(params)`, `details`, `detail(id)`)
  and `retryOnceOnNetworkError`. `lib/api/health.ts`: `healthKeys`, `fetchHealthReport`,
  `healthQueryOptions`, `useHealth()` (retry once, network errors only; global query defaults unchanged).
- Dev badge: `components/dev/api-status-badge.tsx` (client; `role="status"`, `aria-live="polite"`,
  state spelled out in text from `messages.devApiStatus`, tone only repeats it, `data-testid="api-status-badge"`,
  `data-state`) rendered by the Server Component `components/dev/dev-api-status.tsx` from the new
  `(app)/layout.tsx` app-shell placeholder. Hidden in production builds unless `INVESTFUND_DEV_UI=true`
  (same switch as the UI showcase, so the P0 smoke can check it against a production build).
- MSW: `src/mocks/handlers/{health,index}.ts`, `src/mocks/node.ts` (tests, via `test/support/msw.ts`
  `setupMswServer()`, unhandled requests fail), `src/mocks/browser.ts` + `components/providers/api-mocking.tsx`
  (dev opt-in `NEXT_PUBLIC_API_MOCKING=enabled`, only when `NODE_ENV === 'development'`; dynamic
  import, so production bundles contain no MSW code: verified by grepping `.next` JS output).
- Build integration: `client.ts` is imported by a Server Component (`DevApiStatus`, `buildApiUrl`) and
  by Client Components (`ApiStatusBadge` via `useHealth`); `pnpm build` passes.
- Tests (53 new, jsdom only in the 3 files that need it via `// @vitest-environment jsdom`):
  `lib/api/client.test.ts` (success, prefix, JSON/credentials, server never reads the token, contract
  incl. invalid JSON and dev-only logging without body, problem+json, 429 `Retry-After: 30`, http
  fallbacks, 503 handling, network, abort, `parseRetryAfter`), `client.browser.test.ts` (bearer token),
  `problem-form.test.tsx` (real RHF form via Testing Library: message shown, field focused,
  `aria-invalid`; mapping rules), `query.test.ts`, `components/dev/api-status-badge.test.tsx`
  (`useHealth` typed data, network retried once = 2 calls, no retry on contract error, badge ready /
  not ready / unreachable, hidden in production), `components/providers/api-mocking.test.tsx`.

### Dependencies (human-approved for apps/web, exact pins)
`msw` 2.15.0, `react-hook-form` 7.89.0 (dependencies); `@testing-library/react` 16.3.3,
`@testing-library/user-event` 14.6.7, `jsdom` 29.1.1 (devDependencies).
- `msw` 3.0.x was released less than two weeks ago, so the last 2.x is pinned.
- `jsdom` 30.x requires Node `^22.22.2`; 29.1.1 supports the local Node 22.22.0 and CI's Node 22.
- `@testing-library/dom` 10.4.2 is installed **transitively** as the required peer of both Testing
  Library packages (pnpm auto-installs peers); it is not declared in `package.json`.
- `pnpm-workspace.yaml` `allowBuilds: msw: false` (its postinstall only copies the worker script).

### Deviations
- The worker file `apps/web/public/mockServiceWorker.js` is **generated on demand, not committed**
  (`pnpm --filter @investfund/web msw:init`, gitignored, ignored by ESLint and Prettier) so it is never
  deployed with production `public/` assets and stays in sync with the installed MSW version. Without
  it the dev opt-in logs a console warning naming the command and falls back to the real API.
- The dev opt-in holds rendering (returns `null`) until the worker has started so the first queries
  are mocked; Server Component requests are not mocked.
- Messages file is `src/messages/en-GB.json` (the project's locale), not `en.json`.
- No `@testing-library/jest-dom`: assertions use plain DOM properties.

### Local verification (2026-10-10)
`pnpm lint` OK · `pnpm typecheck` OK · `pnpm test` 56 files, 652 passed + 2 todo (web 19 files / 168) ·
`pnpm build` (NEXT_PUBLIC_API_URL=http://localhost:4000) OK · `pnpm format:check` OK ·
`pnpm check:eol` OK · `pnpm audit --audit-level high` no known vulnerabilities.
