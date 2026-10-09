# P0-API-02: Core security, rate limiting, crypto, storage and auth-guard skeleton
Owner: backend        Estimate: M
Requirements: NFR-SEC-01, NFR-PRIV-01
Depends on: P0-API-01

## Goal
Provide the cross-cutting security building blocks in `apps/api/src/core/` so that every feature module gets secure defaults for free: hardened HTTP headers, CORS allowlist, Redis-backed rate-limit presets, Zod request validation, AES-256-GCM encryption with key versions, a swappable storage provider, and JWT auth guards (verification only; token issuance comes in P1).

## Scope
- In: `core/security` (helmet with a strict default CSP for the API, CORS allowlist from `WEB_URL`, `x-powered-by` disabled, JSON body limit 1 MB, `trust proxy` from config); `core/rateLimit` (presets `auth`, `upload`, `ai`, `sensitive`, `default` from `docs/API.md` §3, **Postgres-backed store** (no Redis until R2; human decision 2026-10-09) with an in-memory store for unit tests, `RateLimit-*` and `Retry-After` headers, problem type `rate-limited`); `core/validation` (`validate({ body, query, params })` middleware using shared Zod schemas, mapping issues to `errors[]`); `core/crypto` (`encrypt(plain): { ciphertext: Buffer, keyVersion }`, `decrypt(ciphertext, keyVersion)`, AES-256-GCM with random 96-bit IV, key ring from `ENCRYPTION_KEY` / `ENCRYPTION_KEY_VERSION` plus optional previous keys; `hashToken` (SHA-256) and `hmacIp` helpers); `core/storage` (`StorageProvider` interface: `put(stream, meta) → key`, `get(key) → stream`, `delete(key)`, `exists(key)`; `LocalDiskStorageProvider` rooted at `STORAGE_DIR` with generated keys, path-traversal protection and size limit enforcement while streaming); `core/auth` (`AuthGuards`: `requireAuth()`, `requireRole(...roles)` verifying a JWT access token with `jose` against `JWT_ACCESS_SECRET`; attaches `req.user = { id, role }`; no login endpoints); a readiness check for storage registered with the P0-API-01 registry.
- Out: login, refresh, users table (P1); ownership and visibility services (P2, P4); antivirus scanning (deferred).

## Contracts / inputs
- Endpoints: none new (applies to all)
- Schemas: `ProblemDetails` (`validation-error`, `rate-limited`, `unauthenticated`, `forbidden`)
- Tables: none

## Acceptance criteria
1. Given any API response, When headers are inspected, Then `Strict-Transport-Security` (when not local), `X-Content-Type-Options: nosniff`, `Content-Security-Policy` and `Referrer-Policy` are set and `X-Powered-By` is absent.
2. Given an `Origin` not in the allowlist, When a CORS preflight is sent, Then no `Access-Control-Allow-Origin` header is returned; Given `WEB_URL`, Then it is allowed with credentials.
3. Given a route using the `auth` preset, When an IP sends 11 requests in a minute, Then the 11th returns 429 problem+json with `Retry-After`.
4. Given a route with `validate({ body: Schema })`, When the body is invalid, Then the response is 400 `validation-error` whose `errors[]` contains the field path and code; unknown fields are rejected.
5. Given `encrypt("secret")` twice, When compared, Then the ciphertexts differ (random IV) and both `decrypt` back to `"secret"`; a modified ciphertext byte makes `decrypt` throw.
6. Given data encrypted with key version 1 and the key ring rotated to version 2 (version 1 kept as previous), When decrypted, Then it succeeds; new encryptions use version 2.
7. Given `storage.put` with a stream larger than the configured limit, When streaming, Then it aborts with `payload-too-large` and leaves no partial file.
8. Given a key such as `../../etc/passwd`, When `get` is called, Then it throws and nothing outside `STORAGE_DIR` is read.
9. Given a route with `requireRole("admin")`, When called with no token → 401 `unauthenticated`; with an expired or wrongly signed token → 401; with a valid founder token → 403 `forbidden`; with a valid admin token → passes.
10. Given `NODE_ENV=production` and `OPENAPI_PUBLIC` unset or false, When `GET /api/v1/openapi.json` is called, Then it is mounted behind `requireAuth()` + `requireRole('admin')` (401 / 403 / 200 as in AC9) (`docs/API.md` §5).
11. Given `NODE_ENV=production` and `OPENAPI_PUBLIC=true`, When the API starts, Then exactly one `warn` log line is written naming the flag (no values).

## Test requirements
- Unit: crypto (round trip, tamper, rotation), token hashing, storage provider (temp dir), validation mapping, guards with tokens signed in the test.
- Integration: Supertest for headers, CORS, rate limit (Testcontainers Postgres), validation and guards.
- E2E / non-functional: none.

## Notes / risks
- Re-scoped for R0 session S0.3 (2026-10-09): the rate-limit store is a Postgres table (migration owned by this card, after P0-DB-01). Redis comes back in R2.
- Never log plaintext, keys or tokens. Add the redaction test for `encrypt` inputs.
- This card changes security settings, so its commit request must say so explicitly (CLAUDE.md §5.3).
