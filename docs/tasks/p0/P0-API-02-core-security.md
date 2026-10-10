# P0-API-02: Core security, rate limiting, crypto, storage and auth-guard skeleton
Owner: backend        Estimate: M        Status: committed (6d1c5a4)
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

## Implementation notes (2026-10-09, in-review)

**Dependencies (approved).** `helmet` 8.3.0 and `jose` 6.2.12, pinned exactly in `apps/api`. CORS and the rate limiter are in-house (no `cors`, `express-rate-limit` or `rate-limiter-flexible`).

**Contracts.** `packages/shared`: `USER_ROLES` / `UserRole` / `isUserRole` (`constants/user-roles.ts`, kept in sync with DATABASE.md §3 by a test). The problem slugs (`validation-error`, `rate-limited`, `unauthenticated`, `forbidden`, `payload-too-large`, `dependency-unavailable`) already existed; no schema change, so `openapi.json` is unchanged. New domain errors: `UnauthenticatedError` (adds `WWW-Authenticate: Bearer`, `error="invalid_token"` when a token was sent) and `PayloadTooLargeError`.

**Config (`EnvSchema`).** New: `WEB_URL` (http(s), reduced to its origin; default `http://localhost:3000`, required in production), `TRUST_PROXY` (`false` default, hop count, or IP/CIDR/`loopback|linklocal|uniquelocal` list; `true` refused because it lets clients spoof `X-Forwarded-For` and bypass per-IP limits), `ENCRYPTION_KEY` (required, base64 of exactly 32 bytes; the `.env.example` dev key is refused in production), `ENCRYPTION_KEY_VERSION` (1-32767, default 1), `ENCRYPTION_PREVIOUS_KEYS` (`<version>:<base64>,...`, unique versions, not the current one), `IP_HASH_SECRET` (required; ≥ 32 chars and not a placeholder in production), `STORAGE_DIR` (default `./storage`, resolved to absolute), `MAX_UPLOAD_MB` (1-1024, default 25, the name already used in `.env.example`), `RATE_LIMIT_STORE` (`postgres` default, `memory` refused in production). Errors still name variables only. `.env.example`, `infra/docker-compose.yml` (sandbox `IP_HASH_SECRET` throwaway default) and `apps/api/README.md` updated.

**core/security.** helmet with `useDefaults: false` CSP `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, HSTS (1 year, includeSubDomains) only when `NODE_ENV=production`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, CORP `same-origin`. CORS: exact-origin allowlist (`WEB_URL`), credentials, `Vary: Origin`, exposes `X-Request-Id`, `Location`, `Retry-After`, `RateLimit-*`; preflights end with 204 (no `Access-Control-*` for other origins). JSON body parser 1 MB (strict). `trust proxy` from config.

**core/rateLimit.** Presets in `presets.ts` (`auth` per IP; `upload`/`ai`/`sensitive`/`default` per user when `req.user` is set, else per IP). Headers `RateLimit-Limit/Remaining/Reset/Policy`; 429 `rate-limited` + `Retry-After`. Keys: `hmacHex(IP_HASH_SECRET, "ip:<normalised addr>" | "user:<id>")` (an IP key equals `hmacIp(ip)`). Stores behind `RateLimitStore`: `PostgresRateLimitStore` (fixed window, single tagged `$queryRaw` `INSERT ... ON CONFLICT (preset, key_hash) DO UPDATE ... RETURNING`, database time; `deleteExpired()` deletes ended windows in batches of 1000 and runs in the background every 1000 hits per process) and `MemoryRateLimitStore` (tests, `RATE_LIMIT_STORE=memory`). **Failure policy: fail closed** (store error → 503 `dependency-unavailable`, cause logged only): failing open would drop brute-force protection exactly when the database struggles, and the limited routes need the same database anyway. Mount the limiter after the auth guard so it counts per user.

**Migration.** `20261009201159_rate_limit_buckets` (additive): table `rate_limit_buckets` (`id uuid` PK, `preset varchar(32)`, `key_hash char(64)`, `hits int`, `window_ends_at timestamptz`, `created_at`, `updated_at`), `UNIQUE(preset, key_hash)`, `INDEX(window_ends_at)`. Documented in DATABASE.md §4.2 and §8; API.md §3 heading now says Postgres-backed until R2.

**core/validation.** `validate({ body, query, params })`: parses with the shared schemas (async-safe), makes top-level object schemas strict, maps issues to `errors[]` (`path` = `body.field.sub`, `code` = Zod issue code; one `unrecognized_keys` entry per unknown field), replaces `req.body`/`req.params` and shadows Express 5's `req.query` getter with the parsed value.

**core/crypto.** `AesGcmCipher` (`Cipher` interface): `encrypt(plain) → { ciphertext: iv(12) ‖ ct ‖ tag(16), keyVersion }`, `decrypt(ciphertext, keyVersion)`; generic `DecryptionError` for unknown versions, truncation or tampering. Keys are copied into a private field; `toJSON`/`util.inspect` show versions only. `hashToken` (SHA-256 hex), `hmacIp(ip, secret)` (HMAC-SHA256 hex, IPv4-mapped IPv6 unwrapped). Logger redaction now also covers `plaintext`, `ciphertext` and `encryptionKey`.

**core/file-storage** (deviation: not `core/storage`, see below). `StorageProvider` (`put(stream, { maxBytes? }) → { key, sizeBytes }`, `get`, `delete`, `exists`) and `LocalDiskStorageProvider`: keys `<last 2 hex>/<uuid v7>`, strict key regex plus a resolved-path-inside-root check, uploads streamed to `.tmp/<id>.part` (`wx`, 0600) with a byte-counting transform, aborted with `PayloadTooLargeError` past the limit and the partial file removed, atomic rename on success. `storage` readiness check (root created if missing, writable) registered next to `db`.

**core/auth.** `JwtAccessTokenVerifier` (jose `jwtVerify`, HS256 only, `iss=investfund-api`, `aud=investfund`, `exp` and `sub` required, 5 s clock tolerance, claims parsed with Zod: `sub` UUID, `role` in `USER_ROLES`). `AuthGuards.requireAuth()` / `requireRole(...roles)` set `req.user = { id, role }` (global `Express.Request` augmentation); `requireRole` authenticates on its own. P1 must issue tokens with the same algorithm, issuer and audience.

**OpenAPI (AC10, AC11).** The route is always mounted with the `default` rate limit; `OPENAPI_PUBLIC` true → no guard, otherwise `requireRole('admin')` (also outside production when the flag is explicitly false; previously 404). In production with `OPENAPI_PUBLIC=true` the container logs one `warn` line `{ flag: "OPENAPI_PUBLIC" }`.

**Tests.** Unit: cipher (round trip, random IV, tamper in IV/body/tag, truncation, wrong key, rotation v1→v2, key copy, redaction in JSON/inspect/pino and error messages), hashing, local-disk storage (temp dir: round trip, exact limit, oversize abort with no leftovers, per-call limit, source error cleanup, 11 traversal/malformed keys, not found, readiness), config (+21), container wiring, memory store. Supertest: headers (local and production), CORS (allowed, 5 disallowed origins, actual requests, configured origin), validation (body/query/params, unknown fields, malformed JSON, 1 MB limit), guards (AC9 matrix plus wrong iss/aud/role/sub/alg, `alg: none`, no `exp`, malformed headers, tampered payload, token never logged), rate limiter (AC3, per-IP via trusted proxy, `X-Forwarded-For` ignored when untrusted, per-user, store hashing, fail-closed 503, window reset). Postgres (per-suite test database via `createTestDatabase`, standing in for Testcontainers): store counting, atomicity under 40 concurrent hits, window restart, keyed hash only, `deleteExpired` batches, opportunistic sweep, unreachable DB; AC3, AC10 and AC11 through the real container.

**Deviations.**
1. Module directory `core/file-storage/` instead of `core/storage/`: the project permission rule `Read(./storage/**)` in `.claude/settings.json` (meant for uploaded files) also blocks reading any source directory named `storage`. Narrowing that rule (for example to the root `./storage/**` only, if the matcher allows it) is a settings change for the human.
2. `StorageProvider.put` returns `{ key, sizeBytes }` instead of just the key (size is needed for `stored_files`); `meta` is `{ maxBytes? }` (content type is sniffed and stored by the upload service, S1.5).
3. Not yet implemented, by design (they need request-specific keys or byte accounting): `auth` 5/min per email (P1 login), `upload` 500 MB/hour per user (S1.5), monthly AI quotas (R2).
4. Coverage was not measured: no Vitest coverage provider is installed yet (P0-TEST-01).
5. `infra/seed/seed.ts` reuses `loadConfig`, so it now also needs `ENCRYPTION_KEY` and `IP_HASH_SECRET` (present in `.env.example`).
