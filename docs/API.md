# InvestFund REST API

Implemented in `apps/api/src/modules/*`. Schemas live in `packages/shared/src/api/*.ts` (Zod);
OpenAPI 3.1 is generated from them (`GET /api/v1/openapi.json`, `packages/shared/openapi/openapi.json`).
Domain rules: [`DOMAIN_RULES.md`](DOMAIN_RULES.md). Data: [`DATABASE.md`](DATABASE.md).

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1` (omitted below). System endpoints in §5. |
| JSON | camelCase; requests validated by strict Zod schemas — unknown fields are a 400 (mass-assignment defence). Responses are parsed with the shared schemas before sending. |
| IDs | UUID v7; path ids validated as UUIDs. |
| Time | ISO 8601 UTC; calendar dates `YYYY-MM-DD`. |
| Money | `amountMinor` digit strings (pence/cents) plus `currency` (`GBP`/`EUR`/`USD`). |
| Pagination | `?cursor=&limit=` → `{ data, nextCursor }`. Cursors are opaque (keyset for feeds, offset for ranked lists). |
| Errors | RFC 9457 `application/problem+json` with `requestId` and `errors[]` (`path`, `code`, `message`). |
| Concurrency | Startups and deals carry `version`; offers are answered by id. Stale → `409 version-conflict`. |
| Auth | `Authorization: Bearer <access token>` (15 min). Refresh cookie `if_refresh` (httpOnly, `SameSite=Lax`, `Secure` in production, `Path=/api/v1/auth`). |
| Not found vs forbidden | Resources the caller may not know about return 404 (IDOR policy). Role mismatches return 403. |

## 2. Roles, guards and errors

| Notation | Meaning |
|---|---|
| public | No token |
| user | Any authenticated, active user (role may still be null) |
| founder / supporter / admin | Role re-read from the database on every request |
| party | One of the two users of the connection or deal |
| owner | Founder who owns the startup or document |

Suspended users get 401 on refresh and `403 account-suspended` on any request.

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

## 3. Rate-limit presets (`core/rateLimit`, Postgres-backed)

| Preset | Limit | Applied to |
|---|---|---|
| `auth` | 10/min per IP | Google start and callback (refresh and logout use `default`) |
| `upload` | 20/min per user | Document uploads |
| `ai` | 10/min per user | Reserved (no AI endpoints in the MVP) |
| `sensitive` | 10/min per user | Role choice, connection requests and responses, offers and deal actions, blocks, reports, admin decisions |
| `default` | 120/min per user; 60/min per IP when anonymous | Everything else |

## 4. Visibility

| Data | Anonymous | Supporter | Founder (owner) | Party (accepted connection) | Admin |
|---|---|---|---|---|---|
| Published startup summary, detail, milestones, reported funding | ✓ | ✓ | ✓ | ✓ | ✓ |
| Drafts and archived startups, publication issues, version | ✗ 404 | ✗ 404 | ✓ | ✗ 404 | via reports |
| Supporter preferences | ✗ | own only | ✗ | ✗ | ✗ |
| Supporter display name and bio | ✗ | — | on connection requests | ✓ | ✓ |
| Emails | ✗ | own only | own only | ✗ | report targets only |
| Conversations and messages | ✗ | parties only | parties only | ✓ | ✗ |
| Deals and offers | ✗ | parties only | parties only | ✓ | counts only |
| Documents | ✗ | with access (DOMAIN_RULES §5) | ✓ | with access | ✗ |

## 5. System endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/health/live` | Process is up | public |
| GET | `/health/ready` | Database and storage reachable | public (minimal body) |
| GET | `/metrics` | Prometheus metrics (internal listener only) | internal |
| GET | `/api/v1/openapi.json` | Generated OpenAPI 3.1 | public outside production; admin in production unless `OPENAPI_PUBLIC=true` |

## 6. Endpoints

### 6.1 Auth (`api/auth.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/auth/google/start?returnTo=&loginHint=` | public · `auth` | 303 to Google. Sets the signed `if_oauth` state cookie (PKCE verifier, state, returnTo). `returnTo` must be a relative path. 503 when Google is not configured. |
| GET | `/auth/google/callback` | public · `auth` | Verifies state, exchanges the code and upserts the user. Sets `if_refresh`. 303 to `WEB_URL/auth/complete` or `WEB_URL/login?error=cancelled\|failed\|state\|email_unverified\|account_conflict\|suspended`. |
| POST | `/auth/refresh` | cookie · `default` | JSON body `{}`; `Origin` must be the web origin. Rotates the token → `SessionResponse`. |
| POST | `/auth/logout` | cookie · `default` | Revokes the session, clears the cookie. 204. |

### 6.2 Account and profiles (`api/auth.ts`, `api/profiles.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET/PATCH | `/me` | user | `CurrentUser`; PATCH `name`, `emailNotifications` |
| POST | `/me/role` | user · `sensitive` | `{ role: founder\|supporter }`, once (409 afterwards). Admin cannot be chosen. |
| GET | `/me/unread` | user | `{ messages, notifications }` |
| GET/PUT | `/me/founder-profile` | founder | `FounderProfileInput` |
| GET/PUT | `/me/supporter-profile` | supporter | `SupporterProfileInput` (range rule) |

### 6.3 Startups (`api/startups.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/startups` | public (optional token) | Search: `q, sector, stage, country, purpose, currency, amountMin, amountMax, sort, cursor, limit`. Excludes blocked founders for signed-in users. |
| GET | `/startups/by-slug/{slug}` | public | Published only |
| GET | `/startups/mine` · `/startups/mine/{id}` | founder | Owner views with `publicationIssues` |
| POST | `/startups` | founder (with profile) | Create draft → 201 |
| PATCH | `/startups/{id}` | owner | Partial update plus `version`; funding rules; published listings must stay complete |
| PUT | `/startups/{id}/milestones` | owner | Replace the ordered list atomically, plus `version` |
| POST | `/startups/{id}/publish\|unpublish\|archive\|restore` | owner | `{ version }`; 422 with every publication issue |
| GET | `/startups/{id}/relationship` | user | Saved, connection status, whether a request is possible and why not |
| PUT/DELETE | `/startups/{id}/save` | supporter | Idempotent |

### 6.4 Discovery
| GET | `/recommendations` | supporter | Ranked `Recommendation[]` with `score`, `factors`, `explanation` |
|---|---|---|---|
| GET | `/saved-startups` | supporter | Saved published startups |

### 6.5 Connections (`api/connections.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/connections?direction=&status=` | user | Party's connections |
| POST | `/connections` | supporter · `sensitive` | `{ startupId, message? }`; 409 duplicate, 422 cool-down or quota, 403 blocked |
| GET | `/connections/{id}` | party | `Connection` with `availableActions` |
| POST | `/connections/{id}/actions` | party · `sensitive` | `{ action: accept\|decline\|withdraw }`; accept creates the conversation |

### 6.6 Conversations
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/conversations` · `/conversations/{id}` | party | Summaries with `unreadCount`, `readOnly` |
| GET | `/conversations/{id}/messages?cursor=&limit=` | party | Newest first; `nextCursor` loads older |
| POST | `/conversations/{id}/messages` | party | `{ clientMessageId, body }`. 201 when new, 200 for a retry of the same id. 403 read-only. |
| POST | `/conversations/{id}/read` | party | Marks read up to the latest message |

### 6.7 Real time
| GET | `/realtime/stream` | user | `text/event-stream`. Events: `ready`, `message.created`, `conversation.read`, `notification.created`, `notification.read`, `connection.updated`, `deal.updated`. |
|---|---|---|---|

### 6.8 Deals and offers (`api/deals.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/deals?status=open\|closed\|all&connectionId=` | party | `DealSummary` page |
| POST | `/deals` | party of an accepted connection · `sensitive` | `{ connectionId, terms }`. 409 if a negotiation is already open. |
| GET | `/deals/{id}` | party | Full history, events and available actions |
| POST | `/deals/{id}/offers/{offerId}/respond` | party · `sensitive` | `{ action: accept\|decline\|counter\|revise\|withdraw, terms?, note? }`. 409 when the offer is stale or expired. |
| POST | `/deals/{id}/actions` | party · `sensitive` | `{ action, version, reason? }`. The outcome lifecycle (DOMAIN_RULES §4.2). |

### 6.9 Notifications
| GET | `/notifications?unreadOnly=&cursor=&limit=` | user | Page plus `unreadCount` |
|---|---|---|---|
| POST | `/notifications/read` | user | `{ ids }` or `{ all: true }` |

### 6.10 Documents (`api/documents.ts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/startups/{id}/documents` | owner or party with access | Others get an empty list |
| POST | `/startups/{id}/documents?fileName=&visibility=` | owner · `upload` | Raw body with `Content-Type`. ≤ 10 MB (413). Type, extension and magic bytes are checked. |
| GET | `/documents/{id}/download` | owner or party with access | Attachment, `no-store`, audited; 404 otherwise |
| PUT | `/documents/{id}/sharing` | owner | `{ visibility, connectionIds }`; accepted connections of this startup only |
| DELETE | `/documents/{id}` | owner | Soft delete plus storage delete |

### 6.11 Moderation (`api/moderation.ts`)
| GET/POST | `/blocks` | user | Block `{ userId }` (closes pending requests) |
|---|---|---|---|
| DELETE | `/blocks/{userId}` | user | Unblock |
| POST | `/reports` | user · `sensitive` | `{ targetType: user\|startup, targetId, category, details? }`; one open report per target |

### 6.12 Admin
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/overview` | admin | Real counts only |
| GET | `/admin/reports?status=` · `/admin/reports/{id}` | admin | Queue and detail |
| POST | `/admin/reports/{id}/resolve` | admin · `sensitive` | `{ status: resolved\|dismissed, action, note? }`. `startup_archived` or `user_suspended` are applied atomically and audited. |
| POST | `/admin/users/{id}/actions` | admin · `sensitive` | `{ action: suspend\|reinstate }` (never admins or self) |
