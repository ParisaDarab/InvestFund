# InvestFund REST API contract

Status: **Draft v0.1, awaiting human approval (Gate A)** · Owner: Supervisor · Implemented by: Backend (`apps/api`, schemas in `packages/shared/src/api/<domain>.ts`)
Related: [`DATABASE.md`](DATABASE.md) · [`PHASE_PLAN.md`](PHASE_PLAN.md)

Full per-endpoint blocks are given for Phase 1 and Phase 2 (§6–§7). Later phases are in compact tables (§8) and get full blocks in their own Gate A.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1`. **Paths in this document omit the `/api/v1` prefix**, except the system endpoints in §5. |
| Resources | Plural nouns, kebab-case. At most one parent segment: `/startups/{startupId}/documents` lists and creates; the item is then `/documents/{documentId}` (decision D12). Singletons under a parent are allowed (`/startups/{id}/product`). `outreach` and `meetings` are namespaces for drafts, threads and proposals. |
| IDs | UUID v7 strings. Path parameters are validated as UUIDs (so literal segments such as `/meetings/proposals` never collide with `/meetings/{meetingId}`). |
| JSON | `camelCase`. Requests and responses are validated by the shared Zod schemas; unknown request fields are rejected (`.strict()`). |
| Time | ISO 8601 UTC (`2026-10-08T09:30:00Z`); calendar dates `YYYY-MM-DD`. |
| Money | `{ "amountMinor": "2500000", "currency": "GBP" }` (string to keep BIGINT precision). Schema `Money`. |
| Percent | Number with 2 decimals (`12.50`). |
| Pagination | Cursor: `?cursor=&limit=` (default 20, max 100) → `{ "data": [], "nextCursor": "…" \| null }`. Schema `CursorPage<T>`. |
| Filtering and sorting | Explicit query parameters per endpoint (Zod-validated); no free-form filter language. |
| Errors | RFC 9457 `application/problem+json`: `type`, `title`, `status`, `detail`, `instance`, `requestId`, and `errors[]` (`{ path, code, message }`) for validation. Schema `ProblemDetails`. |
| Async work | `202 Accepted` + `Location: /api/v1/jobs/{jobId}` + body `JobAccepted { jobId, status }`. Poll `GET /jobs/{jobId}` → `Job { id, type, status, progress, result, error }`. |
| Side effects | Explicit action sub-resources (`POST /outreach/drafts/{id}/approve`, `POST /meetings/proposals/{id}/confirm`). They require `Idempotency-Key` and create an approval record (`DATABASE.md` §6). |
| Idempotency | `Idempotency-Key` header (8–128 chars). **Required** on approve, confirm and cancel actions and on AI job creation; **supported** on uploads and creates. A repeated key with the same body returns the first response; with a different body returns `409 idempotency-key-reuse`. Keys are kept for 24 hours. |
| Concurrency | Profile autosave is last-write-wins. Drafts and proposals carry `version`; approve and confirm need `expectedVersion` (`409 version-conflict` if stale). |
| Auth | `Authorization: Bearer <accessToken>` (JWT, 15 min). Refresh token in the `if_rt` cookie: httpOnly, Secure (except local), SameSite=Lax, `Path=/api/v1/auth`. Cookie-authenticated endpoints also require the `Origin` header to match the web origin (CSRF defence). |
| Visibility | Endpoints returning startup data pass through the **visibility policy service**, which selects the response schema per viewer (§4). |
| Headers | Every response carries `X-Request-Id` (generated or propagated). Rate-limited responses carry `RateLimit-*` headers and `Retry-After` on 429. |
| Versioning | Breaking changes need `/api/v2` or an approved migration. Additive changes are allowed. OpenAPI 3.1 is generated from the shared schemas; CI fails on an unapproved breaking diff. |

## 2. Roles, guards and errors

### Auth notation

| Notation | Meaning |
|---|---|
| public | No token |
| user | Any authenticated, active user with a verified email |
| founder | Role `founder` |
| founder:member / founder:owner | Founder who is a member / the owner of the startup in the path (or of the resource's startup) |
| investor | Role `investor` |
| investor:member / investor:owner | Member / owner of the investor profile in the path |
| investor:certified | Investor whose own certification is `active` and unexpired |
| investor:verified | `investor:certified` **and** profile `verification_status = verified` |
| party | A member of either side of a **connected** match that the resource belongs to |
| admin | Role `admin` |

Suspended users get `401` on refresh and `403 account-suspended` on any request with a still-valid access token.

### Standard problem types (`type` = `https://investfund.local/problems/<slug>`)

| Status | Slug | When |
|---|---|---|
| 400 | `validation-error` | Zod validation failed (`errors[]` lists fields) |
| 401 | `unauthenticated` | Missing, invalid or expired token |
| 401 | `invalid-credentials` | Wrong email or password (one response for both) |
| 403 | `forbidden` | Authenticated but the role or state does not allow the action (for example an unverified investor expressing interest) |
| 403 | `account-suspended`, `email-not-verified` | Account state |
| 404 | `not-found` | The resource does not exist **or the caller is not allowed to know it exists** (IDOR policy: non-members get 404, not 403) |
| 409 | `conflict`, `version-conflict`, `idempotency-key-reuse`, `invalid-state` | Uniqueness, stale version, state-machine violation |
| 410 | `token-expired` | Verification, reset, sign-up or invitation token expired |
| 413 | `payload-too-large` | Upload over 25 MB |
| 415 | `unsupported-media-type` | Sniffed type not allowed |
| 423 | `account-locked` | Too many failed logins (with `Retry-After`) |
| 422 | `business-rule-violation` | Semantically invalid (for example use-of-funds totals, publish prerequisites) with `errors[]` |
| 422 | `quota-exceeded` | Monthly AI quota used up |
| 424 | `integration-required` | Gmail or Calendar not connected or revoked |
| 429 | `rate-limited` | Rate limit hit |
| 500 | `internal-error` | Unexpected server error. Title `Internal server error`, generic `detail`, never a stack or internal message (the stack is logged with the request ID only). Never thrown as a `DomainError`; the central handler uses it for any unrecognised error (review decision 2026-10-09, replaces `about:blank`) |
| 503 | `dependency-unavailable` | A database, queue, LLM or Google dependency is unreachable or its circuit is open |

## 3. Rate-limit presets (`core/rateLimit`; Postgres-backed in R0–R1, Redis from R2)

| Preset | Limit | Applied to |
|---|---|---|
| `auth` | 10/min per IP **and** 5/min per email (login, forgot, resend) | Auth endpoints |
| `upload` | 20/min and 500 MB/hour per user | Uploads |
| `ai` | 10/min per user, plus monthly quotas where stated | Endpoints that enqueue LLM work |
| `sensitive` | 10/min per user | Approvals, demo-credential reveals, LLM key changes. **New preset, proposed here.** |
| `default` | 120/min per user; 60/min per IP when anonymous | Everything else |

## 4. Field visibility (PRD §7)

### 4.1 Startup data by viewer

Field groups (shared schema that serialises each view in brackets):

- **Teaser** [`StartupTeaser`]: opaque `id`, industry and sub-industry, company stage, current round type, country and city, round size (`amountRequired`), instrument, one-liner, traction band, SEIS/EIS status, investor-facing match score and rationale.
- **Identity** [part of `StartupConnectedView`]: name, website, logo.
- **Team**: team members.
- **Full profile**: description, business model, target markets, founded date, team size, Companies House number, product and MVP (URLs), traction figures and metrics, full round details (min ticket, max target, valuation, equity, timeline, committed amount, lead secured, existing investors, milestones), use of funds, document list and downloads (only documents with `sharedWithConnections = true`).
- **Demo credentials**: only through `POST /startups/{id}/demo-credential-reveals` (audited).
- **Contact**: founder members' names and emails, messaging, meeting proposals, Gmail outreach.
- **Owner-only**: completeness score, extractions, analyses, deck reviews, campaigns and pipeline notes, members and invitations, draft or unpublished state.

| Viewer state | Teaser | Identity | Team | Full profile | Demo credentials | Contact | Owner-only |
|---|---|---|---|---|---|---|---|
| Anonymous | ✗ (401) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Founder of another startup | ✗ (404) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Investor without an active certification | ✗ (403 on deal flow, 404 on items) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Investor certified, profile not verified (A7) | ✓ deal flow, read-only | name only if `publicNameVisible` | ✗ | ✗ | ✗ | ✗ | ✗ |
| Investor verified, no match row | ✗ (404) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Investor verified, match `suggested`, `*_interested` or `declined` | ✓ | name only if `publicNameVisible` | ✗ | ✗ | ✗ | ✗ | ✗ |
| Investor verified, match `connected` | ✓ | ✓ | ✓ | ✓ | ✓ reveal (audited) | ✓ | ✗ |
| Founder member of this startup | ✓ | ✓ | ✓ | ✓ | ✓ (read own) | n/a | ✓ (members and invitations: read-only) |
| Founder owner of this startup | ✓ | ✓ | ✓ | ✓ | ✓ (read/write own) | n/a | ✓ |
| Admin | ✓ | ✓ | ✓ | ✓ (access audited) | ✗ (least privilege) | ✗ | ✓ read-only |

Rules:
1. Only **published** startups appear to investors. Unpublished, suspended or deleted startups return 404 to investors, **including connected ones** (*Assumption, pending human confirmation*).
2. An investor whose certification expires falls back to "without an active certification" even when connected; connected data re-appears after renewal (*Assumption, pending human confirmation*).
3. Notifications, match rationales (`forInvestor`), emails sent by the platform and assistant answers must respect the same matrix. The investor-side rationale is generated from teaser fields only.
4. Every endpoint that returns startup data has an integration test for each viewer row (TEST_STRATEGY invariant 2).

### 4.2 Investor data seen by founders (A10)

| Viewer state | Public card [`InvestorPublicCard`]: type, display and firm name, bio, city/country, stages, sectors, geographies, cheque range, instruments, SEIS/EIS and lead preference, thesis text, deployment status, portfolio | Contact [`InvestorConnectedView`]: contact email, LinkedIn, website, team members, messaging, meetings, Gmail outreach |
|---|---|---|
| Founder whose published startup has a match row with the investor | ✓ | ✗ |
| Founder with a `connected` match | ✓ | ✓ |
| Any other founder | ✗ (404) | ✗ |
| Investor member of the profile | full self view [`InvestorProfile`] | |
| Admin | full, including verification notes | |

## 5. System endpoints (P0)

| Method | Path | Purpose | Auth | Response | Rate limit | Req |
|---|---|---|---|---|---|---|
| GET | `/health/live` | Process is up | public | `200 { status: "ok" }` | none | NFR-OBS-01 |
| GET | `/health/ready` | DB, Redis and storage reachable | public (minimal body) | `200 HealthReport` / `503 HealthReport` | none | NFR-OBS-01 |
| GET | `/metrics` | Prometheus metrics | internal network only (not routed publicly) | text/plain | none | NFR-OBS-01 |
| GET | `/api/v1/openapi.json` | Generated OpenAPI 3.1 | public in local/sandbox; admin in production | JSON | default | NFR-MAINT-01 |

`openapi.json` exposure (review decision 2026-10-09):
- `OPENAPI_PUBLIC=true` serves it without auth. Only local and the sandbox compose stack set it (the sandbox runs with `NODE_ENV=production`, so the flag, not `NODE_ENV`, decides). It must never be set in a real deployment.
- Otherwise, outside production it is public by default (P0-API-01 behaviour).
- Otherwise, in production it is served behind `requireAuth()` + `requireRole('admin')` (added by P0-API-02). Until P0-API-02 lands it is simply not mounted (404), which fails closed.
- When `NODE_ENV=production` and `OPENAPI_PUBLIC=true`, the API logs one `warn` line at start-up (no values).

## 6. Phase 1 endpoints (full detail)

### 6.1 Auth (`packages/shared/src/api/auth.ts`)

#### POST /auth/register
Purpose: create a founder or investor account with email and password and send a verification email
Auth: public
Request: `RegisterRequest { email, password (12–128 chars), fullName (1–120), role: "founder" | "investor", consents: { terms: true, privacyPolicy: true, marketingEmail?: boolean }, policyVersions: { terms, privacyPolicy } }`
Response 202: `AcceptedMessage { message }`. The response is identical whether or not the email already exists; an existing account gets an "you already have an account" email instead (enumeration-safe).
Errors: 400 validation (including weak password), 429
Side effects: `users` (status `pending_verification`), `consent_records`, `auth_tokens(email_verification)`, verification email
Rate limit: `auth`
Shared schemas: `RegisterRequest`, `AcceptedMessage`
Requirement: NFR-SEC-01, NFR-PRIV-01, PRD §2

#### POST /auth/verify-email
Purpose: confirm the email address with the token from the verification link
Auth: public
Request: `VerifyEmailRequest { token }`
Response 200: `AuthSession { accessToken, expiresIn, user: UserMe }` and sets the refresh cookie (the user is logged in after verifying)
Errors: 400, 410 `token-expired` (problem `type` `token-expired`), 409 `invalid-state` (already used), 429
Rate limit: `auth`
Shared schemas: `VerifyEmailRequest`, `AuthSession`, `UserMe`
Requirement: NFR-SEC-01

#### POST /auth/verify-email/resend
Purpose: resend the verification email
Auth: public
Request: `ResendVerificationRequest { email }`
Response 202: `AcceptedMessage` (always, enumeration-safe)
Errors: 400, 429
Rate limit: `auth` (plus at most 3 per hour per email)
Shared schemas: `ResendVerificationRequest`, `AcceptedMessage`
Requirement: NFR-SEC-01

#### POST /auth/login
Purpose: log in with email and password
Auth: public
Request: `LoginRequest { email, password }`
Response 200: `AuthSession` and sets the refresh cookie (new token family)
Errors: 400; 401 `invalid-credentials` (same response for unknown email and wrong password); 403 `email-not-verified`; 403 `account-suspended`; 423 `account-locked` with `Retry-After` after 5 failures (lock grows 1 → 5 → 15 minutes); 429
Side effects: `last_login_at`, `failed_login_count`, `audit_logs(auth.login | auth.login_failed)`
Rate limit: `auth`
Shared schemas: `LoginRequest`, `AuthSession`
Requirement: NFR-SEC-01

#### POST /auth/refresh
Purpose: rotate the refresh token and issue a new access token
Auth: refresh cookie (`if_rt`) + matching `Origin`
Request: empty body
Response 200: `AuthSession` and sets the rotated refresh cookie
Errors: 401 `unauthenticated` (missing, expired or revoked). **Reuse of an already-rotated token revokes the whole family** and writes `audit_logs(auth.refresh_reuse_detected)`. 403 `account-suspended`.
Rate limit: `default` (per IP)
Shared schemas: `AuthSession`
Requirement: NFR-SEC-01

#### POST /auth/logout
Purpose: revoke the current refresh token family and clear the cookie
Auth: refresh cookie + `Origin` (works even if the access token has expired)
Request: empty
Response 204
Errors: none (idempotent)
Rate limit: `default`
Shared schemas: none
Requirement: NFR-SEC-01

#### POST /auth/logout-all
Purpose: revoke every refresh token of the user (all devices)
Auth: user
Request: empty
Response 204
Errors: 401
Rate limit: `sensitive`
Shared schemas: none
Requirement: NFR-SEC-01

#### POST /auth/password/forgot
Purpose: send a password-reset link
Auth: public
Request: `ForgotPasswordRequest { email }`
Response 202: `AcceptedMessage` (always)
Errors: 400, 429
Rate limit: `auth`
Shared schemas: `ForgotPasswordRequest`, `AcceptedMessage`
Requirement: NFR-SEC-01

#### POST /auth/password/reset
Purpose: set a new password with a reset token
Auth: public
Request: `ResetPasswordRequest { token, newPassword }`
Response 204. All refresh tokens of the user are revoked.
Errors: 400, 410 `token-expired`, 409 `invalid-state` (used), 429
Rate limit: `auth`
Shared schemas: `ResetPasswordRequest`
Requirement: NFR-SEC-01

#### GET /auth/google/start
Purpose: begin Google sign-in or sign-up (scopes `openid email profile`)
Auth: public
Request: query `GoogleStartQuery { intent: "signin" | "signup", role?: "founder" | "investor", returnTo?: relative path }`
Response 302 to Google's authorise URL with `state` (signed, stored in a short-lived httpOnly cookie) and a PKCE `code_challenge`
Errors: 400 (bad `returnTo`, which must be a relative in-app path), 429
Rate limit: `auth`
Shared schemas: `GoogleStartQuery`
Requirement: PRD §3 (Auth), NFR-SEC-01

#### GET /auth/google/callback
Purpose: OAuth callback for sign-in and for the incremental Gmail and Calendar consent (P6, P7)
Auth: public + `state` cookie
Request: query `code`, `state` (or `error`)
Response 302 to the web app:
- existing linked user → sets the refresh cookie → `/{locale}/auth/callback?status=ok`
- existing user with the same verified email but no link → links the Google account (Google emails are verified) → as above
- new user and `intent=signup` with a role → creates the user (email verified) → as above, then `/onboarding`
- new user without a role → `/{locale}/auth/google/complete?ticket=<opaque>` (15-minute single-use ticket, hashed in `auth_tokens`)
- connect flows → `/{locale}/settings/integrations?status=connected|error`
Errors: redirects with `status=error&code=<slug>` (`state-mismatch`, `access-denied`, `account-suspended`); never shows provider errors raw
Rate limit: `auth`
Shared schemas: none (redirect)
Requirement: PRD §3 (Auth), FR-OUT-02, FR-MEET-01

#### POST /auth/google/complete-signup
Purpose: finish a Google sign-up by choosing a role and giving consent
Auth: public + ticket
Request: `GoogleCompleteSignupRequest { ticket, role: "founder" | "investor", consents, policyVersions }`
Response 201: `AuthSession` and sets the refresh cookie
Errors: 400, 410 `token-expired`, 409 `conflict` (account created meanwhile), 429
Rate limit: `auth`
Shared schemas: `GoogleCompleteSignupRequest`, `AuthSession`
Requirement: PRD §3 (Auth), NFR-PRIV-01

### 6.2 Users (`packages/shared/src/api/users.ts`)

#### GET /users/me
Purpose: the current user, with role, memberships and integration flags for the app shell
Auth: user
Response 200: `UserMe { id, email, fullName, role, status, locale, timezone, workingHours?, emailVerified, startup?: { id, role }, investorProfile?: { id, role, verificationStatus }, certification?: { kind, expiresAt, status }, integrations: { gmail: IntegrationStatus | null, calendar: IntegrationStatus | null } }`
Errors: 401
Rate limit: `default`
Shared schemas: `UserMe`
Requirement: PRD §2

#### PATCH /users/me
Purpose: update name, locale, time zone and working hours
Auth: user
Request: `UpdateMeRequest { fullName?, locale?: "en-GB", timezone?: IANA, workingHours?: WorkingHours }`
Response 200: `UserMe`
Errors: 400, 401
Rate limit: `default`
Shared schemas: `UpdateMeRequest`, `UserMe`, `WorkingHours`
Requirement: NFR-I18N-01, FR-AI-07 (working hours)

#### PUT /users/me/password
Purpose: change or set the password (Google-only users can set one)
Auth: user
Request: `ChangePasswordRequest { currentPassword? (required if a password exists), newPassword }`
Response 204. Other sessions are revoked; the current one is rotated.
Errors: 400, 401, 403 `invalid-credentials`, 429
Rate limit: `sensitive`
Shared schemas: `ChangePasswordRequest`
Requirement: NFR-SEC-01

#### GET /users/me/consents
Purpose: current consent state per kind, with policy versions
Auth: user
Response 200: `ConsentState { items: [{ kind, granted, policyVersion, recordedAt }] }`
Errors: 401
Rate limit: `default`
Shared schemas: `ConsentState`
Requirement: NFR-PRIV-01

#### POST /users/me/consents
Purpose: record a consent change (marketing email, analytics cookies, re-acceptance of new terms)
Auth: user
Request: `RecordConsentRequest { kind, granted, policyVersion, source: "settings" | "cookie_banner" }`
Response 201: `ConsentState`
Errors: 400, 401, 422 (`terms` or `privacy_policy` cannot be withdrawn here; that is account deletion)
Rate limit: `default`
Shared schemas: `RecordConsentRequest`, `ConsentState`
Requirement: NFR-PRIV-01, PRD §10 (cookie banner)

## 7. Phase 2 endpoints (full detail)

### 7.1 Startups (`packages/shared/src/api/startups.ts`)

#### GET /startups
Purpose: list startups. Founders get their own (0 or 1, A6); admins get all with filters.
Auth: founder | admin (investors get 403 and use `GET /matches`)
Request: query `ListStartupsQuery { cursor?, limit?, status? (admin), q? (admin, name prefix) }`
Response 200: `CursorPage<StartupOwnerView>` (founder) or `CursorPage<StartupAdminSummary>` (admin)
Errors: 401, 403
Rate limit: `default`
Shared schemas: `ListStartupsQuery`, `StartupOwnerView`, `StartupAdminSummary`
Requirement: FR-STARTUP-01, FR-ADM-01

#### POST /startups
Purpose: create the founder's startup as a draft; the caller becomes owner
Auth: founder (with no existing startup membership)
Request: `CreateStartupRequest { name, oneLiner?, industry?, country? }`
Response 201: `StartupOwnerView` + `Location`
Errors: 400, 401, 403, 409 `conflict` (already a member of a startup)
Idempotency: `Idempotency-Key` supported
Rate limit: `default`
Shared schemas: `CreateStartupRequest`, `StartupOwnerView`
Requirement: FR-STARTUP-01, FR-STARTUP-09

#### GET /startups/{startupId}
Purpose: get a startup, serialised per the visibility matrix (§4.1)
Auth: user (the policy decides the view)
Response 200: one of `StartupOwnerView` | `StartupConnectedView` | `StartupTeaser` | `StartupAdminView`, discriminated by `view: "owner" | "connected" | "teaser" | "admin"`
Errors: 401, 403 (investor without certification), 404 (no right to know)
Side effects: admin and connected-investor reads write `audit_logs(startup.viewed)` (rate-limited dedupe, one per viewer per day)
Rate limit: `default`
Shared schemas: `StartupView` (discriminated union)
Requirement: FR-STARTUP-01, PRD §7

#### PATCH /startups/{startupId}
Purpose: update company information (wizard step 1 autosave; partial)
Auth: founder:member
Request: `UpdateStartupRequest` (all FR-STARTUP-01 fields optional: `name, publicNameVisible, oneLiner, description, industry, subIndustry, businessModel, country, city, targetMarkets[], website, companyStage, foundedOn, teamSize, companiesHouseNumber, seisEisStatus`)
Response 200: `StartupOwnerView` (with recomputed `completenessScore`)
Errors: 400 (for example Companies House format `^([0-9]{8}|[A-Z]{2}[0-9]{6})$`), 401, 404, 409 `invalid-state` (suspended)
Side effects: a published startup whose matching-relevant fields change enqueues `embedding_refresh` (debounced 5 minutes)
Rate limit: `default`
Shared schemas: `UpdateStartupRequest`, `StartupOwnerView`
Requirement: FR-STARTUP-01, FR-STARTUP-09

#### DELETE /startups/{startupId}
Purpose: soft-delete the startup (unpublishes, archives matches, hides from connections)
Auth: founder:owner
Request: header `X-Confirm: <startup name>`
Response 204
Errors: 401, 404, 422 (confirmation does not match)
Rate limit: `sensitive`
Shared schemas: none
Requirement: NFR-PRIV-01

#### GET /startups/{startupId}/completeness
Purpose: completeness score with the missing items per wizard step
Auth: founder:member
Response 200: `Completeness { score, steps: [{ step, complete, missing: [fieldPath] }], publishable, publishBlockers: [code] }`
Errors: 401, 404
Rate limit: `default`
Shared schemas: `Completeness`
Requirement: FR-STARTUP-09

#### POST /startups/{startupId}/publish
Purpose: publish the profile so it can be matched
Auth: founder:owner
Request: empty
Response 200: `StartupOwnerView` (`status: published`). Enqueues `embedding_refresh` and `match_run(startup)` (from P4; a no-op before).
Errors: 401, 404, 409 `invalid-state` (already published or suspended), 422 `business-rule-violation` with `errors[]` = publish blockers (required fields, a current round, valid use of funds)
Rate limit: `default`
Shared schemas: `StartupOwnerView`
Requirement: FR-STARTUP-09

#### POST /startups/{startupId}/unpublish
Purpose: take the profile out of matching (connected investors also lose access, rule 4.1.1)
Auth: founder:owner
Response 200: `StartupOwnerView`
Errors: 401, 404, 409 `invalid-state`
Rate limit: `default`
Shared schemas: `StartupOwnerView`
Requirement: FR-STARTUP-09

#### GET /startups/{startupId}/team-members
Purpose: list the founding team
Auth: founder:member | connected investor | admin (others 404)
Response 200: `{ data: TeamMember[] }` (small list, unpaginated)
Errors: 401, 404
Rate limit: `default`
Shared schemas: `TeamMember`
Requirement: FR-STARTUP-02

#### POST /startups/{startupId}/team-members
Purpose: add a founding-team entry
Auth: founder:member
Request: `CreateTeamMemberRequest { fullName, roleTitle, bio?, priorStartupExperience?, industryExperience?, linkedinUrl?, expertiseTags[]?, displayOrder? }`
Response 201: `TeamMember`
Errors: 400, 401, 404, 422 (maximum 20 entries)
Rate limit: `default`
Shared schemas: `CreateTeamMemberRequest`, `TeamMember`
Requirement: FR-STARTUP-02

#### PATCH /startups/{startupId}/team-members/{teamMemberId}
Purpose: edit a team entry
Auth: founder:member
Request: `UpdateTeamMemberRequest` (partial of the create body)
Response 200: `TeamMember`
Errors: 400, 401, 404
Rate limit: `default`
Shared schemas: `UpdateTeamMemberRequest`, `TeamMember`
Requirement: FR-STARTUP-02

#### DELETE /startups/{startupId}/team-members/{teamMemberId}
Purpose: remove a team entry
Auth: founder:member
Response 204
Errors: 401, 404
Rate limit: `default`
Shared schemas: none
Requirement: FR-STARTUP-02

#### GET /startups/{startupId}/product
Purpose: product and MVP section (demo credentials are never included)
Auth: founder:member | connected investor | admin
Response 200: `Product { description, problem, solution, category, technologies[], competitiveAdvantages, intellectualProperty, productStatus, mvpDescription, mvpUrl, demoUrl, hasDemoCredentials }`
Errors: 401, 404
Rate limit: `default`
Shared schemas: `Product`
Requirement: FR-STARTUP-03, FR-STARTUP-04

#### PUT /startups/{startupId}/product
Purpose: create or replace the product section (wizard autosave)
Auth: founder:member
Request: `UpsertProductRequest` (all fields of `Product` except `hasDemoCredentials`; all optional)
Response 200: `Product`
Errors: 400 (URLs must be `https`), 401, 404
Rate limit: `default`
Shared schemas: `UpsertProductRequest`, `Product`
Requirement: FR-STARTUP-03, FR-STARTUP-04

#### GET /startups/{startupId}/demo-credentials
Purpose: the owner team reads back its own stored demo credentials
Auth: founder:member
Response 200: `DemoCredentials { username, password, notes?, updatedAt }`; `Cache-Control: no-store`
Errors: 401, 404 (also when none are stored)
Side effects: `audit_logs(startup.demo_credentials_read)`
Rate limit: `sensitive`
Shared schemas: `DemoCredentials`
Requirement: FR-STARTUP-04

#### PUT /startups/{startupId}/demo-credentials
Purpose: set or replace the demo credentials (stored encrypted)
Auth: founder:member
Request: `SetDemoCredentialsRequest { username (≤200), password (≤200), notes? (≤500) }`
Response 204
Errors: 400, 401, 404
Rate limit: `sensitive`
Shared schemas: `SetDemoCredentialsRequest`
Requirement: FR-STARTUP-04, NFR-SEC-01

#### DELETE /startups/{startupId}/demo-credentials
Purpose: delete the stored demo credentials
Auth: founder:member
Response 204
Errors: 401, 404
Rate limit: `sensitive`
Shared schemas: none
Requirement: FR-STARTUP-04

#### GET /startups/{startupId}/traction
Purpose: headline traction figures
Auth: founder:member | connected investor | admin
Response 200: `Traction { currentUsers, payingCustomers, revenueTtm: Money?, mrr: Money?, growthRatePct, retentionPct, asOf, tractionBand }`
Errors: 401, 404
Rate limit: `default`
Shared schemas: `Traction`
Requirement: FR-STARTUP-04

#### PUT /startups/{startupId}/traction
Purpose: create or replace headline traction (autosave); recomputes `tractionBand`
Auth: founder:member
Request: `UpsertTractionRequest` (fields of `Traction` except `tractionBand`; all optional)
Response 200: `Traction`
Errors: 400, 401, 404
Rate limit: `default`
Shared schemas: `UpsertTractionRequest`, `Traction`
Requirement: FR-STARTUP-04

#### GET /startups/{startupId}/traction-metrics
Purpose: list additional metrics
Auth: founder:member | connected investor | admin
Request: query `{ key?, cursor?, limit? }`
Response 200: `CursorPage<TractionMetric>`
Errors: 401, 404
Rate limit: `default`
Shared schemas: `TractionMetric`
Requirement: FR-STARTUP-04

#### POST /startups/{startupId}/traction-metrics
Purpose: add a metric value for a period
Auth: founder:member
Request: `CreateTractionMetricRequest { key, value (decimal string), unit?, periodStart, periodEnd, note? }`
Response 201: `TractionMetric`
Errors: 400 (period order), 401, 404
Rate limit: `default`
Shared schemas: `CreateTractionMetricRequest`, `TractionMetric`
Requirement: FR-STARTUP-04

#### PATCH /startups/{startupId}/traction-metrics/{metricId}
Purpose: edit a metric
Auth: founder:member
Request: `UpdateTractionMetricRequest` (partial)
Response 200: `TractionMetric`
Errors: 400, 401, 404
Rate limit: `default`
Shared schemas: `UpdateTractionMetricRequest`, `TractionMetric`
Requirement: FR-STARTUP-04

#### DELETE /startups/{startupId}/traction-metrics/{metricId}
Purpose: delete a metric
Auth: founder:member
Response 204
Errors: 401, 404
Rate limit: `default`
Shared schemas: none
Requirement: FR-STARTUP-04

#### GET /startups/{startupId}/funding-rounds
Purpose: list rounds (current first)
Auth: founder:member | admin. Connected investors see the current round inside `StartupConnectedView`.
Response 200: `{ data: FundingRound[] }`
Errors: 401, 404
Rate limit: `default`
Shared schemas: `FundingRound`
Requirement: FR-STARTUP-05, FR-STARTUP-07

#### POST /startups/{startupId}/funding-rounds
Purpose: create a round (FR-STARTUP-05 and timeline FR-STARTUP-07)
Auth: founder:member
Request: `CreateFundingRoundRequest { roundType, status?, isCurrent?, amountRequired: Money, minTicket?: Money, maxTarget?: Money, preMoneyValuation?: Money, equityOfferedPct?, instrument, instrumentOther?, startDate?, targetCloseDate?, committedAmount?: Money, leadInvestorSecured?, existingInvestors?: [{ name, type, amount?: Money }], milestones? }`
Response 201: `FundingRound`. Setting `isCurrent` clears it on the other rounds in the same transaction.
Errors: 400 (currency must be GBP in the MVP; `minTicket ≤ amountRequired ≤ maxTarget`; dates in order), 401, 404
Rate limit: `default`
Shared schemas: `CreateFundingRoundRequest`, `FundingRound`, `Money`
Requirement: FR-STARTUP-05, FR-STARTUP-07

#### GET /funding-rounds/{roundId}
Purpose: get one round
Auth: founder:member (of the round's startup) | admin
Response 200: `FundingRound`
Errors: 401, 404
Rate limit: `default`
Shared schemas: `FundingRound`
Requirement: FR-STARTUP-05

#### PATCH /funding-rounds/{roundId}
Purpose: update a round (partial, autosave)
Auth: founder:member
Request: `UpdateFundingRoundRequest` (partial of create)
Response 200: `FundingRound`. Changing `amountRequired` re-validates use of funds and reports any mismatch as a publish blocker (it does not reject the change).
Errors: 400, 401, 404
Rate limit: `default`
Shared schemas: `UpdateFundingRoundRequest`, `FundingRound`
Requirement: FR-STARTUP-05, FR-STARTUP-07

#### DELETE /funding-rounds/{roundId}
Purpose: delete a round
Auth: founder:owner
Response 204
Errors: 401, 404, 409 `invalid-state` (the current round of a published startup, or one used by a campaign)
Rate limit: `default`
Shared schemas: none
Requirement: FR-STARTUP-05

#### GET /funding-rounds/{roundId}/use-of-funds
Purpose: use-of-funds line items and their totals
Auth: founder:member | admin | connected investor (current round only)
Response 200: `UseOfFunds { items: UseOfFundsItem[], totalAllocationPct, totalAmount: Money, roundTarget: Money, valid, problems: [code] }`
Errors: 401, 404
Rate limit: `default`
Shared schemas: `UseOfFunds`, `UseOfFundsItem`
Requirement: FR-STARTUP-06

#### PUT /funding-rounds/{roundId}/use-of-funds
Purpose: replace all line items atomically
Auth: founder:member
Request: `ReplaceUseOfFundsRequest { items: [{ category, amount: Money, allocationPct, description?, expectedOutcome? }] (1–20) }`
Response 200: `UseOfFunds`
Errors: 400; 422 `business-rule-violation` when allocations do not total 100.00% or amounts do not total the round target within ±1% (`errors[]` gives both totals), 401, 404
Rate limit: `default`
Shared schemas: `ReplaceUseOfFundsRequest`, `UseOfFunds`
Requirement: FR-STARTUP-06

#### PUT /startups/{startupId}/logo
Purpose: upload or replace the logo (PNG, JPEG or WebP, ≤ 2 MB; SVG is rejected because it can carry scripts)
Auth: founder:member
Request: `multipart/form-data`: `file`
Response 200: `StartupOwnerView`
Errors: 400, 401, 404, 413, 415, 429
Rate limit: `upload`
Shared schemas: `StartupOwnerView`
Requirement: FR-STARTUP-01

#### GET /startups/{startupId}/members
Purpose: platform users who manage the startup
Auth: founder:member | admin
Response 200: `{ data: StartupMember[] }` (`{ userId, fullName, email, role, joinedAt }`)
Errors: 401, 404
Rate limit: `default`
Shared schemas: `StartupMember`
Requirement: FR-STARTUP-02

#### DELETE /startups/{startupId}/members/{userId}
Purpose: remove a co-founder (owner) or leave (self)
Auth: founder:owner, or founder:member removing themselves
Response 204. The removed user's sessions keep their role but lose access.
Errors: 401, 404, 409 `invalid-state` (the owner cannot remove themselves; ownership transfer is deferred)
Rate limit: `sensitive`
Shared schemas: none
Requirement: FR-STARTUP-02

#### GET /startups/{startupId}/invitations
Purpose: list pending and past invitations
Auth: founder:member
Request: query `{ status? }`
Response 200: `{ data: Invitation[] }`
Errors: 401, 404
Rate limit: `default`
Shared schemas: `Invitation`
Requirement: FR-STARTUP-02

#### POST /startups/{startupId}/invitations
Purpose: invite a co-founder by email (founder role, member)
Auth: founder:owner
Request: `CreateInvitationRequest { email }`
Response 201: `Invitation` (the email is sent through Mailpit/SMTP; the token is never returned)
Errors: 400, 401, 404, 409 `conflict` (pending invitation exists, or the email belongs to a member), 422 (maximum 10 pending), 429
Rate limit: `sensitive`
Shared schemas: `CreateInvitationRequest`, `Invitation`
Requirement: FR-STARTUP-02

#### DELETE /startups/{startupId}/invitations/{invitationId}
Purpose: revoke a pending invitation
Auth: founder:owner
Response 204
Errors: 401, 404, 409 `invalid-state`
Rate limit: `default`
Shared schemas: none
Requirement: FR-STARTUP-02

#### POST /invitations/lookup
Purpose: show who invited the user to what, before signup or acceptance (the token stays out of URLs sent to the API)
Auth: public
Request: `InvitationLookupRequest { token }`
Response 200: `InvitationPreview { targetType: "startup" | "investor_profile", targetName, invitedByName, role, email (masked), expiresAt }`
Errors: 400, 404 (unknown), 410 `token-expired`, 429
Rate limit: `auth`
Shared schemas: `InvitationLookupRequest`, `InvitationPreview`
Requirement: FR-STARTUP-02, FR-INV-01

#### POST /invitations/accept
Purpose: accept an invitation as the logged-in user (the email must match; new users register first with the same email)
Auth: user (role must match the target: founder for startups, investor for investor profiles)
Request: `AcceptInvitationRequest { token }`
Response 200: `UserMe` (with the new membership)
Errors: 400, 401, 403 (role or email mismatch), 409 `conflict` (already a member elsewhere, A6), 410 `token-expired`
Rate limit: `auth`
Shared schemas: `AcceptInvitationRequest`, `UserMe`
Requirement: FR-STARTUP-02, FR-INV-01

### 7.2 Documents and extraction (`packages/shared/src/api/documents.ts`)

#### POST /startups/{startupId}/documents
Purpose: upload a supporting document; extractable kinds start AI extraction
Auth: founder:member
Request: `multipart/form-data`: `file` (PDF, PPTX, DOCX, XLSX ≤ 25 MB; for kind `screenshot`: PNG, JPEG, WebP ≤ 10 MB), `kind: DocumentKind`, `title?`, `sharedWithConnections?`. The type is sniffed from content; the extension and client MIME are ignored.
Response 201: `DocumentResource` (kind `screenshot`), or 202: `DocumentResource` + `extractionJob: JobAccepted` with `Location: /api/v1/jobs/{jobId}`
Errors: 400 validation, 401, 404 (not a member), 413 too large, 415 type, 422 (more than 50 documents per startup), 429
Idempotency: `Idempotency-Key` header supported
Rate limit: `upload` (the extraction also counts against `ai`)
Shared schemas: `UploadDocumentRequest`, `DocumentResource`, `JobAccepted`
Requirement: FR-STARTUP-08, FR-AI-01

#### GET /startups/{startupId}/documents
Purpose: list documents
Auth: founder:member | admin | connected investor (only `sharedWithConnections`, from P4)
Request: query `{ kind?, cursor?, limit? }`
Response 200: `CursorPage<DocumentResource>`
Errors: 401, 404
Rate limit: `default`
Shared schemas: `DocumentResource`
Requirement: FR-STARTUP-08, PRD §7

#### GET /documents/{documentId}
Purpose: document metadata, status and latest extraction summary
Auth: as the list
Response 200: `DocumentResource { id, startupId, kind, title, status, mimeType, sizeBytes, pageCount, sharedWithConnections, latestExtraction?: { id, status }, createdAt }` (investors never see `latestExtraction`)
Errors: 401, 404
Rate limit: `default`
Shared schemas: `DocumentResource`
Requirement: FR-STARTUP-08

#### PATCH /documents/{documentId}
Purpose: rename, change kind or change sharing
Auth: founder:member
Request: `UpdateDocumentRequest { title?, kind?, sharedWithConnections? }`
Response 200: `DocumentResource`
Errors: 400, 401, 404
Rate limit: `default`
Shared schemas: `UpdateDocumentRequest`, `DocumentResource`
Requirement: FR-STARTUP-08

#### DELETE /documents/{documentId}
Purpose: delete a document (soft delete; the file is removed by the retention job within 24 hours)
Auth: founder:member
Response 204
Errors: 401, 404
Rate limit: `default`
Shared schemas: none
Requirement: FR-STARTUP-08, NFR-PRIV-01

#### GET /documents/{documentId}/download
Purpose: download the file
Auth: founder:member | admin | connected investor (if shared)
Response 200: the file stream, `Content-Disposition: attachment; filename*=…`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`
Errors: 401, 404
Side effects: investor and admin downloads write `audit_logs(document.downloaded)`
Rate limit: `default`
Shared schemas: none
Requirement: FR-STARTUP-08, PRD §7

#### POST /documents/{documentId}/extractions
Purpose: run (or re-run) AI extraction on a document
Auth: founder:member
Request: empty
Response 202: `JobAccepted` + `Location`
Errors: 401, 404, 409 `invalid-state` (an extraction is already running; kind not extractable), 429, 503 `dependency-unavailable`
Idempotency: `Idempotency-Key` **required**
Rate limit: `ai`
Shared schemas: `JobAccepted`
Requirement: FR-AI-01

#### GET /documents/{documentId}/extractions
Purpose: extraction history of a document
Auth: founder:member
Response 200: `{ data: ExtractionSummary[] }` (`{ id, status, createdAt, reviewedAt }`)
Errors: 401, 404
Rate limit: `default`
Shared schemas: `ExtractionSummary`
Requirement: FR-AI-01

#### GET /extractions/{extractionId}
Purpose: extracted facts for review, each with the current profile value for comparison
Auth: founder:member
Response 200: `Extraction { id, documentId, status, facts: [{ path, label, value, currentValue, confidence, source: { page, quote } }], model, promptVersion, createdAt }`
Errors: 401, 404
Rate limit: `default`
Shared schemas: `Extraction`, `ExtractedFact`
Requirement: FR-STARTUP-08, FR-AI-01

#### POST /extractions/{extractionId}/apply
Purpose: apply accepted (and optionally edited) facts to the profile
Auth: founder:member
Request: `ApplyExtractionRequest { accepted: [{ path, value }] }` (each `path` must exist in the extraction; edited values are validated against the same schema as the profile endpoints)
Response 200: `ApplyExtractionResult { extraction: Extraction (status applied | partially_applied), startup: StartupOwnerView }`
Errors: 400 (unknown path, invalid value), 401, 404, 409 `invalid-state` (not `pending_review`)
Rate limit: `default`
Shared schemas: `ApplyExtractionRequest`, `ApplyExtractionResult`
Requirement: FR-STARTUP-08 ("the founder reviews and accepts or edits the facts")

#### POST /extractions/{extractionId}/discard
Purpose: reject all facts
Auth: founder:member
Response 200: `Extraction` (status `discarded`)
Errors: 401, 404, 409 `invalid-state`
Rate limit: `default`
Shared schemas: `Extraction`
Requirement: FR-STARTUP-08

### 7.3 Jobs (`packages/shared/src/api/jobs.ts`)

#### GET /jobs/{jobId}
Purpose: poll a background job
Auth: the job owner | admin
Response 200: `Job { id, type, status, progress, result?: { resourceType, resourceId }, error?: { code, message }, createdAt, finishedAt }`
Errors: 401, 404
Rate limit: `default` (the client polls with backoff: 1 s → 5 s)
Shared schemas: `Job`
Requirement: NFR-REL-01

#### GET /jobs
Purpose: the caller's recent jobs (for the "AI jobs" indicator)
Auth: user
Request: query `{ status?, type?, cursor?, limit? }`
Response 200: `CursorPage<Job>`
Errors: 401
Rate limit: `default`
Shared schemas: `Job`
Requirement: NFR-REL-01, FR-NOTIF-01

### 7.4 Reference (`packages/shared/src/api/reference.ts`)

#### GET /reference/taxonomy
Purpose: versioned sector, sub-industry, geography and enum labels for forms (A9)
Auth: public
Response 200: `Taxonomy { version, sectors: [{ code, label, subIndustries: [{ code, label }] }], geographies: [...], enums: {...} }` with `Cache-Control: public, max-age=3600` and an `ETag`
Errors: none
Rate limit: `default`
Shared schemas: `Taxonomy`
Requirement: FR-STARTUP-01, FR-INV-03

## 8. Endpoint catalogue for Phases 3–10 (compact)

Columns: **Auth** uses §2 notation; **Request/Response** are shared schema names; errors always include 401 for non-public endpoints, so only the key ones are listed. "RL" is the rate-limit preset.

### 8.1 Investors (P3, `api/investors.ts`)

| Method | Path | Purpose | Auth | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|---|
| POST | `/investors` | Create the caller's investor profile (draft, owner) | investor (no profile) | `CreateInvestorRequest` → 201 `InvestorProfile` | 409 already a member | default | FR-INV-01 |
| GET | `/investors/{investorId}` | Profile per viewer (§4.2) | investor:member \| founder with match \| admin | → `InvestorView` (`self` \| `publicCard` \| `connected` \| `admin`) | 404 | default | FR-INV-01 |
| PATCH | `/investors/{investorId}` | Update identity and capacity (FR-INV-04) | investor:member | `UpdateInvestorRequest` → `InvestorProfile` | 400 | default | FR-INV-01, FR-INV-04 |
| POST | `/investors/{investorId}/submit-verification` | Submit for admin verification | investor:owner + investor:certified | → `InvestorProfile` | 422 incomplete; 409 state | default | FR-INV-02 |
| GET | `/investors/{investorId}/thesis` | Get thesis | investor:member \| founder with match (public fields) \| admin | → `Thesis` | 404 | default | FR-INV-03 |
| PUT | `/investors/{investorId}/thesis` | Replace thesis; triggers embedding refresh and match run | investor:member | `UpsertThesisRequest` → `Thesis` | 400 (cheque min ≤ max) | default | FR-INV-03 |
| GET | `/investors/{investorId}/portfolio-companies` | List portfolio | as thesis | → `{ data: PortfolioCompany[] }` | 404 | default | FR-INV-05 |
| POST | `/investors/{investorId}/portfolio-companies` | Add a company | investor:member | `CreatePortfolioCompanyRequest` → 201 `PortfolioCompany` | 400, 422 max 200 | default | FR-INV-05 |
| PATCH | `/investors/{investorId}/portfolio-companies/{companyId}` | Edit | investor:member | `UpdatePortfolioCompanyRequest` → `PortfolioCompany` | 404 | default | FR-INV-05 |
| DELETE | `/investors/{investorId}/portfolio-companies/{companyId}` | Remove | investor:member | → 204 | 404 | default | FR-INV-05 |
| GET | `/investors/{investorId}/team-members` | Displayed team | investor:member \| connected founder \| admin | → `{ data: InvestorTeamMember[] }` | 404 | default | FR-INV-01 |
| POST | `/investors/{investorId}/team-members` | Add a team entry | investor:member | `CreateInvestorTeamMemberRequest` → 201 | 400 | default | FR-INV-01 |
| PATCH | `/investors/{investorId}/team-members/{teamMemberId}` | Edit | investor:member | `UpdateInvestorTeamMemberRequest` → `InvestorTeamMember` | 404 | default | FR-INV-01 |
| DELETE | `/investors/{investorId}/team-members/{teamMemberId}` | Remove | investor:member | → 204 | 404 | default | FR-INV-01 |
| GET | `/investors/{investorId}/members` | Platform users acting for the profile | investor:member \| admin | → `{ data: InvestorMember[] }` | 404 | default | FR-INV-01 |
| DELETE | `/investors/{investorId}/members/{userId}` | Remove a member or leave | investor:owner \| self | → 204 | 409 owner | sensitive | FR-INV-01 |
| GET | `/investors/{investorId}/invitations` | List invitations | investor:member | → `{ data: Invitation[] }` | 404 | default | FR-INV-01 |
| POST | `/investors/{investorId}/invitations` | Invite a team member | investor:owner | `CreateInvitationRequest` → 201 `Invitation` | 409, 422 | sensitive | FR-INV-01 |
| DELETE | `/investors/{investorId}/invitations/{invitationId}` | Revoke | investor:owner | → 204 | 409 state | default | FR-INV-01 |

### 8.2 Certifications (P3, `api/certifications.ts`)

| Method | Path | Purpose | Auth | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|---|
| GET | `/certifications/statements` | Current statement texts and versions per kind | investor | → `{ data: CertificationStatement[] }` | | default | FR-INV-02 |
| POST | `/certifications` | Sign a statement (snapshot, 12-month expiry) | investor | `SignCertificationRequest { kind, statementVersion, confirmations[] }` → 201 `Certification` | 400, 409 stale version | sensitive | FR-INV-02 |
| GET | `/certifications/me` | Current certification and history | investor | → `CertificationStatus { current?, history[] }` | | default | FR-INV-02 |

### 8.3 Matching (P4, `api/matching.ts`)

| Method | Path | Purpose | Auth | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|---|
| GET | `/matches` | Founder: ranked investors. Investor: ranked deal flow (teasers). | founder:member (published) \| investor:certified | `ListMatchesQuery { status?, minScore?, stage?, sector?, investorType?, cursor, limit }` → `CursorPage<FounderMatchView \| InvestorMatchView>` | 403 uncertified | default | FR-AI-02, PRD §7 |
| GET | `/matches/{matchId}` | One match with breakdown and side-specific rationale | a member of either side \| admin | → `FounderMatchView \| InvestorMatchView \| AdminMatchView` | 404 | default | FR-AI-02 |
| POST | `/matches/{matchId}/interest` | Express interest; notifies the other side | founder:member \| investor:verified | → `MatchView` | 403 unverified; 409 invalid-state | sensitive | PRD §7 |
| POST | `/matches/{matchId}/withdraw-interest` | Withdraw before acceptance | the side that expressed it | → `MatchView` | 409 | default | PRD §7 |
| POST | `/matches/{matchId}/accept` | Accept the other side's interest → `connected`; unlocks data, notifies | founder:member \| investor:verified (the non-initiating side) | → `MatchView` | 403, 409 | sensitive | PRD §7 |
| POST | `/matches/{matchId}/decline` | Decline a suggestion or an interest | founder:member \| investor:certified | `DeclineMatchRequest { reason? }` → `MatchView` | 409 | default | PRD §7 |
| POST | `/match-runs` | On-demand recompute for the caller's own startup or profile | founder:member \| investor:verified | `Idempotency-Key` → 202 `JobAccepted` | 409 running; 422 unpublished | ai | FR-AI-02 |
| GET | `/match-runs/{runId}` | Run status and counts | owner side \| admin | → `MatchRun` | 404 | default | FR-AI-02 |
| POST | `/startups/{startupId}/demo-credential-reveals` | Reveal demo credentials to a connected investor (audited) | investor:verified with a `connected` match | → 201 `DemoCredentials` (`Cache-Control: no-store`) | 404 | sensitive | FR-STARTUP-04, PRD §7 |

### 8.4 Notifications (P4 core, P8 preferences, `api/notifications.ts`)

| Method | Path | Purpose | Auth | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|---|
| GET | `/notifications` | List (newest first) | user | `{ unreadOnly?, cursor, limit }` → `CursorPage<Notification>` | | default | FR-NOTIF-01 |
| GET | `/notifications/unread-count` | Badge count (polled) | user | → `{ count }` | | default (polling allowance 4/min) | FR-NOTIF-01 |
| POST | `/notifications/{notificationId}/read` | Mark one read | user (owner) | → 204 | 404 | default | FR-NOTIF-01 |
| POST | `/notifications/read-all` | Mark all read | user | → 204 | | default | FR-NOTIF-01 |
| GET | `/notifications/preferences` | Per-type in-app and email settings (P8) | user | → `NotificationPreferences` | | default | FR-NOTIF-01 |
| PUT | `/notifications/preferences` | Replace preferences (P8) | user | `NotificationPreferences` → same | 400 | default | FR-NOTIF-01 |

### 8.5 Analysis and deck coach (P5, `api/analysis.ts`)

| Method | Path | Purpose | Auth | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|---|
| POST | `/startups/{startupId}/analyses` | Run the startup analyzer | founder:member | `Idempotency-Key` → 202 `JobAccepted` | 422 quota-exceeded, 409 running, 503 | ai | FR-AI-03 |
| GET | `/startups/{startupId}/analyses` | Analysis history | founder:member \| admin | → `CursorPage<AnalysisSummary>` | 404 | default | FR-AI-03 |
| GET | `/analyses/{analysisId}` | Six area scores, benchmark and fixes | founder:member \| admin | → `StartupAnalysis` | 404 | default | FR-AI-03 |
| GET | `/startups/{startupId}/ai-quota` | Remaining analyses and deck reviews this month | founder:member | → `AiQuota` | 404 | default | FR-AI-03, FR-AI-04 |
| POST | `/documents/{documentId}/deck-reviews` | Run the deck coach on a `pitch_deck` | founder:member | `Idempotency-Key` → 202 `JobAccepted` | 409 wrong kind or running; 422 quota | ai | FR-AI-04 |
| GET | `/startups/{startupId}/deck-reviews` | Deck review history | founder:member \| admin | → `CursorPage<DeckReviewSummary>` | 404 | default | FR-AI-04 |
| GET | `/deck-reviews/{deckReviewId}` | Score, slide feedback, missing slides | founder:member \| admin | → `DeckReview` | 404 | default | FR-AI-04 |

### 8.6 Campaigns (P6, `api/campaigns.ts`)

| Method | Path | Purpose | Auth | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|---|
| GET | `/campaigns` | The startup's campaigns | founder:member | `{ status?, cursor, limit }` → `CursorPage<Campaign>` | | default | FR-OUT-01 |
| POST | `/campaigns` | Create a campaign for a round | founder:member | `CreateCampaignRequest { name, fundingRoundId, filters? }` → 201 `Campaign` | 409 name | default | FR-OUT-01 |
| GET | `/campaigns/{campaignId}` | Campaign with stage counts | founder:member | → `CampaignDetail` | 404 | default | FR-OUT-01 |
| PATCH | `/campaigns/{campaignId}` | Rename, change filters, pause or archive | founder:member | `UpdateCampaignRequest` → `Campaign` | 409 state | default | FR-OUT-01 |
| GET | `/campaigns/{campaignId}/targets` | Pipeline board data | founder:member | `{ stage?, dueFollowUp?, cursor, limit }` → `CursorPage<CampaignTarget>` | 404 | default | FR-OUT-01, FR-OUT-03 |
| POST | `/campaigns/{campaignId}/targets` | Add investors from matches | founder:member | `AddTargetsRequest { matchIds[] (≤50) }` → 201 `{ data: CampaignTarget[] }` | 422 (match not the startup's) | default | FR-OUT-01 |
| PATCH | `/campaign-targets/{targetId}` | Move stage, set notes or follow-up date | founder:member | `UpdateTargetRequest` → `CampaignTarget` | 409 (cannot move before `connected` into contact stages, A1) | default | FR-OUT-01, FR-OUT-03 |
| DELETE | `/campaign-targets/{targetId}` | Remove from the campaign | founder:member | → 204 | 404 | default | FR-OUT-01 |

### 8.7 Outreach and Google integrations (P6, `api/outreach.ts`, `api/auth.ts`, `api/users.ts`)

| Method | Path | Purpose | Auth | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|---|
| POST | `/auth/google/connect` | Start incremental consent for Gmail or Calendar | user | `GoogleConnectRequest { product: "gmail" \| "calendar" }` → `{ authorizationUrl }` | 409 already connected | auth | FR-OUT-02, FR-MEET-01 |
| GET | `/users/me/integrations` | Gmail and Calendar status | user | → `Integrations` | | default | FR-OUT-02 |
| DELETE | `/users/me/integrations/{integration}` | Disconnect (revokes at Google) | user | → 204 | 404 | sensitive | FR-OUT-02 |
| GET | `/users/me/approvals` | The caller's approval records (transparency) | user | `{ action?, cursor, limit }` → `CursorPage<ApprovalRecordView>` | | default | NFR-AI-01 |
| POST | `/outreach/drafts` | Create a draft: AI (202) or manual (201) | founder:member, target `connected` (A1) | `CreateDraftRequest { campaignTargetId, kind, mode: "ai" \| "manual", subject?, bodyText?, instructions? }` + `Idempotency-Key` → 202 `JobAccepted` / 201 `EmailDraft` | 409 not connected; 424 Gmail; 503 | ai | FR-AI-05 |
| GET | `/outreach/drafts` | List drafts | founder:member | `{ campaignId?, status?, cursor, limit }` → `CursorPage<EmailDraft>` | | default | FR-AI-05 |
| GET | `/outreach/drafts/{draftId}` | Get a draft | founder:member | → `EmailDraft` | 404 | default | FR-AI-05 |
| PATCH | `/outreach/drafts/{draftId}` | Edit; bumps `version`, invalidates approvals | founder:member | `UpdateDraftRequest { subject?, bodyText?, toEmails?, ccEmails? }` → `EmailDraft` | 409 state; 422 recipients not connected | default | FR-AI-05 |
| DELETE | `/outreach/drafts/{draftId}` | Discard | founder:member | → 204 | 409 sending/sent | default | FR-AI-05 |
| POST | `/outreach/drafts/{draftId}/approve` | **Approve and send** from the user's Gmail (approval record + queued `SendEmailCommand`) | founder:member who is the sender | `ApproveDraftRequest { expectedVersion }` + **required** `Idempotency-Key` → 202 `JobAccepted { approvalRecordId }` | 409 version-conflict; 424 Gmail; 422 daily cap | sensitive | FR-OUT-02, NFR-AI-01 |
| GET | `/outreach/threads` | Tracked threads | founder:member | `{ campaignId?, campaignTargetId?, cursor, limit }` → `CursorPage<EmailThreadSummary>` | | default | FR-OUT-03 |
| GET | `/outreach/threads/{threadId}` | Messages with classification and suggested next action | founder:member | → `EmailThread` | 404 | default | FR-OUT-03, FR-AI-06 |
| POST | `/outreach/threads/{threadId}/sync` | Fetch new replies now | founder:member | → 202 `JobAccepted` | 424 Gmail | ai | FR-OUT-03 |
| PATCH | `/outreach/messages/{messageId}/classification` | Override a reply classification | founder:member | `OverrideClassificationRequest { classification }` → `EmailMessage` | 409 outbound | default | FR-AI-06 |

### 8.8 Meetings (P7, `api/meetings.ts`)

| Method | Path | Purpose | Auth | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|---|
| POST | `/meetings/proposals` | Create a proposal; the AI proposes slots from free/busy | party (organiser needs Calendar) | `CreateProposalRequest { matchId, campaignTargetId?, title, agenda?, durationMinutes, windowStart, windowEnd }` + `Idempotency-Key` → 202 `JobAccepted` | 409 not connected; 424 Calendar | ai | FR-MEET-01, FR-AI-07 |
| GET | `/meetings/proposals` | List proposals | party | `{ matchId?, status?, cursor, limit }` → `CursorPage<MeetingProposal>` | | default | FR-MEET-01 |
| GET | `/meetings/proposals/{proposalId}` | Get a proposal with candidate slots | party | → `MeetingProposal` | 404 | default | FR-AI-07 |
| PATCH | `/meetings/proposals/{proposalId}` | Pick a slot, edit title, agenda or attendees (bumps `version`) | organiser | `UpdateProposalRequest` → `MeetingProposal` | 409 state; 422 attendee not a party | default | FR-MEET-01 |
| POST | `/meetings/proposals/{proposalId}/confirm` | **Approve and book**: approval record → `events.insert` with Meet link and invites | organiser | `ConfirmProposalRequest { expectedVersion }` + **required** `Idempotency-Key` → 202 `JobAccepted { approvalRecordId }` | 409 version; 422 no slot; 424 | sensitive | FR-MEET-01, NFR-AI-01 |
| POST | `/meetings/proposals/{proposalId}/cancel` | Cancel an unbooked proposal (no external effect) | organiser | → `MeetingProposal` | 409 booked | default | FR-MEET-01 |
| GET | `/meetings` | Upcoming and past meetings | party | `{ from?, to?, cursor, limit }` → `CursorPage<Meeting>` | | default | FR-MEET-01 |
| GET | `/meetings/{meetingId}` | Meeting detail | party | → `Meeting` | 404 | default | FR-MEET-01 |
| POST | `/meetings/{meetingId}/cancel` | **Approve and cancel** the Google event (notifies attendees) | organiser | `CancelMeetingRequest { reason? }` + **required** `Idempotency-Key` → 202 `JobAccepted { approvalRecordId }` | 409 state; 424 | sensitive | FR-MEET-01, NFR-AI-01 |

### 8.9 Messaging (P8, `api/messaging.ts`)

| Method | Path | Purpose | Auth | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|---|
| GET | `/conversations` | The caller's conversations with unread counts | founder:member \| investor:member | `{ cursor, limit }` → `CursorPage<ConversationSummary>` | | default | FR-MSG-01 |
| GET | `/conversations/{conversationId}` | Conversation header (counterparty, match) | party | → `Conversation` | 404 | default | FR-MSG-01 |
| GET | `/conversations/{conversationId}/messages` | Messages, newest first | party | `{ cursor, limit }` → `CursorPage<Message>` | 404 | default | FR-MSG-01 |
| POST | `/conversations/{conversationId}/messages` | Send a message, with up to 5 attachments | party | `multipart/form-data` (`body`, `files[]`) or JSON `SendMessageRequest` → 201 `Message` | 409 locked; 413; 415 | upload (with files) / default | FR-MSG-01 |
| DELETE | `/messages/{messageId}` | Remove the caller's own message (body cleared) | sender | → 204 | 404 | default | FR-MSG-01 |
| POST | `/conversations/{conversationId}/read` | Mark read up to now | party | → 204 | 404 | default | FR-MSG-01 |
| GET | `/message-attachments/{attachmentId}/download` | Download an attachment | party \| admin (moderation, audited) | → file stream | 404 | default | FR-MSG-01 |

### 8.10 Admin (P3 verification, P9 rest, P10 data requests; `api/admin.ts`)

All admin endpoints: Auth **admin**; every mutating call writes `audit_logs`.

| Method | Path | Purpose | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|
| GET | `/admin/verification-queue` | Investor profiles awaiting verification (P3) | `{ status?, cursor, limit }` → `CursorPage<VerificationQueueItem>` | | default | FR-ADM-01, FR-INV-02 |
| POST | `/admin/investors/{investorId}/verify` | Verify (P3) | `VerifyInvestorRequest { note? }` → `InvestorAdminView` | 409 state; 422 certification not active | sensitive | FR-ADM-01 |
| POST | `/admin/investors/{investorId}/reject` | Reject with a reason (P3) | `RejectInvestorRequest { reason, note? }` → `InvestorAdminView` | 409 | sensitive | FR-ADM-01 |
| POST | `/admin/investors/{investorId}/request-info` | Ask the investor for more information (P3) | `RequestInfoRequest { message }` → `InvestorAdminView` | 409 | sensitive | FR-ADM-01 |
| GET | `/admin/users` | Search users | `{ role?, status?, q?, cursor, limit }` → `CursorPage<AdminUserSummary>` | | default | FR-ADM-01 |
| GET | `/admin/users/{userId}` | User detail (memberships, verification, flags) | → `AdminUserDetail` | 404 | default | FR-ADM-01 |
| POST | `/admin/users/{userId}/suspend` | Suspend: revoke sessions, unpublish, lock conversations | `SuspendUserRequest { reason }` → `AdminUserDetail` | 409; 422 self | sensitive | FR-ADM-01 |
| POST | `/admin/users/{userId}/reactivate` | Reactivate | → `AdminUserDetail` | 409 | sensitive | FR-ADM-01 |
| POST | `/flags` | Report content (**any user**, not admin) | `CreateFlagRequest { targetType, targetId, reason, details? }` → 201 `Flag` | 404 target not visible; 409 duplicate open flag | default | FR-ADM-02 |
| GET | `/admin/flags` | Moderation queue | `{ status?, targetType?, cursor, limit }` → `CursorPage<FlagAdminView>` | | default | FR-ADM-02 |
| POST | `/admin/flags/{flagId}/resolve` | Dismiss, hide content or suspend the user | `ResolveFlagRequest { action, note? }` → `FlagAdminView` | 409 resolved | sensitive | FR-ADM-02 |
| GET | `/admin/llm-settings` | Settings per task (key shown as last four characters only) | → `{ data: LlmSettingView[] }` | | default | FR-ADM-03 |
| PUT | `/admin/llm-settings/{task}` | Set base URL, model, key and limits for a task | `UpsertLlmSettingRequest { baseUrl?, model?, apiKey?, temperature?, maxOutputTokens?, timeoutMs?, prices?, enabled? }` → `LlmSettingView` | 400 (HTTPS outside sandbox); 422 `default` cannot be emptied | sensitive | FR-ADM-03 |
| DELETE | `/admin/llm-settings/{task}` | Revert a task to inherit `default` | → 204 | 422 for `default` | sensitive | FR-ADM-03 |
| POST | `/admin/llm-settings/{task}/test` | Test connection (tiny completion or embedding; stores the result) | → `LlmTestResult { ok, latencyMs, model, errorCode? }` | 503 | ai | FR-ADM-03 |
| GET | `/admin/matching-weights` | Active version and history | → `{ active: MatchingWeights, history: MatchingWeights[] }` | | default | FR-ADM-04 |
| POST | `/admin/matching-weights` | Create a new version (inactive) | `CreateMatchingWeightsRequest { weights, hardFilters, minScore, note? }` → 201 `MatchingWeights` | 422 weights must total 1.0 | sensitive | FR-ADM-04 |
| POST | `/admin/matching-weights/{weightsId}/activate` | Activate and enqueue a full re-run | `Idempotency-Key` → 202 `JobAccepted` | 409 already active | sensitive | FR-ADM-04 |
| POST | `/admin/match-runs` | Full re-run without changing weights | `Idempotency-Key` → 202 `JobAccepted` | 409 running | ai | FR-ADM-04 |
| GET | `/admin/platform-settings` | Quotas, top N, send cap, certification validity | → `PlatformSettings` | | default | FR-ADM-04, FR-AI-03 |
| PATCH | `/admin/platform-settings` | Update settings | `UpdatePlatformSettingsRequest` → `PlatformSettings` | 400 | sensitive | FR-ADM-04 |
| GET | `/admin/analytics/overview` | Users, published profiles, matches, connections, emails sent, meetings (by period) | `{ from, to, granularity: day \| week \| month }` → `AnalyticsOverview` | 400 range > 366 days | default | FR-ADM-05 |
| GET | `/admin/analytics/llm-usage` | Calls, tokens, latency and estimated cost by task and model | `{ from, to, task? }` → `LlmUsageReport` | 400 | default | FR-ADM-05 |
| GET | `/admin/audit-logs` | Audit log viewer | `{ actorUserId?, action?, subjectType?, subjectId?, from?, to?, cursor, limit }` → `CursorPage<AuditLogEntry>` | | default | FR-ADM-06 |
| GET | `/admin/data-requests` | GDPR export and deletion requests (P10) | `{ type?, status?, cursor, limit }` → `CursorPage<DataRequestAdminView>` | | default | NFR-PRIV-01 |

### 8.11 Privacy self-service (P10, `api/users.ts`)

| Method | Path | Purpose | Auth | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|---|
| POST | `/users/me/data-exports` | Request an export (JSON + files ZIP) | user | `Idempotency-Key` → 202 `JobAccepted` | 409 one in progress | sensitive | NFR-PRIV-01 |
| GET | `/users/me/data-exports/{requestId}` | Export status | user (owner) | → `DataExport { status, expiresAt? }` | 404 | default | NFR-PRIV-01 |
| GET | `/users/me/data-exports/{requestId}/download` | Download the ZIP (7 days) | user (owner) | → file stream | 404, 410 expired | sensitive | NFR-PRIV-01 |
| DELETE | `/users/me` | Delete the account (re-authentication with password, or a recent Google sign-in) | user | `DeleteAccountRequest { password?, confirm: "DELETE" }` → 202 `JobAccepted` | 403 re-auth; 409 sole owner with other members (transfer first) | sensitive | NFR-PRIV-01 |

### 8.12 Assistant (P10, `api/assistant.ts`)

| Method | Path | Purpose | Auth | Request → Response | Key errors | RL | Req |
|---|---|---|---|---|---|---|---|
| POST | `/assistant/threads` | Start a thread | founder \| investor | `CreateAssistantThreadRequest { title? }` → 201 `AssistantThread` | | default | FR-AI-08 |
| GET | `/assistant/threads` | List threads | owner | `{ cursor, limit }` → `CursorPage<AssistantThread>` | | default | FR-AI-08 |
| GET | `/assistant/threads/{threadId}` | Thread with messages and tool-call summaries | owner | → `AssistantThreadDetail` | 404 | default | FR-AI-08 |
| POST | `/assistant/threads/{threadId}/messages` | Send a message; the agent runs read-only and draft-only tools | owner | `AssistantMessageRequest { content (≤ 4000) }` + `Idempotency-Key` → 202 `JobAccepted` | 503 | ai | FR-AI-08, NFR-AI-01 |
| DELETE | `/assistant/threads/{threadId}` | Delete a thread | owner | → 204 | 404 | default | FR-AI-08 |

## 9. Endpoint count

| Group | Phase(s) | Endpoints |
|---|---|---|
| System | P0 | 4 |
| Auth | P1 (12), P6 (1) | 13 |
| Users (incl. invitations accept/lookup, integrations, approvals, privacy) | P1 (5), P2 (2), P6 (3), P10 (4) | 14 |
| Startups (incl. team, product, traction, rounds, use of funds, members, invitations, logo, and the P4 reveal listed in §8.3) | P2 (36), P4 (1) | 37 |
| Documents and extractions | P2 | 11 |
| Jobs | P2 | 2 |
| Reference | P2 | 1 |
| Investors | P3 | 19 |
| Certifications | P3 | 3 |
| Matching (excluding the reveal) | P4 | 8 |
| Notifications | P4 (4), P8 (2) | 6 |
| Analysis | P5 | 7 |
| Campaigns | P6 | 8 |
| Outreach | P6 | 10 |
| Meetings | P7 | 9 |
| Messaging | P8 | 7 |
| Admin (incl. `POST /flags`) | P3 (4), P9 (20), P10 (1) | 25 |
| Assistant | P10 | 5 |
| **Total** | | **189** |

## 10. Gate A checklist (api-contract-design)

- [x] Every PRD functional requirement in scope maps to endpoints (§6–§8, `Req` column; see `PHASE_PLAN.md` §5)
- [x] Auth, role and ownership defined for every endpoint (§2 notation)
- [x] Error cases enumerated (§2 table plus key errors per endpoint)
- [x] No endpoint leaks gated startup data: one visibility policy, discriminated view schemas, investor-side rationale from teaser fields only (§4)
- [x] Rate limits on auth, AI and upload endpoints (§3), plus the proposed `sensitive` preset
