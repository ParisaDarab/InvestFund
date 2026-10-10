# mock-google

Deterministic HTTP mock of the Google OAuth 2.0, Gmail and Calendar endpoints InvestFund uses
(P0-MOCK-02). It lets sign-in, Gmail and Calendar flows run in CI and the sandbox without real
Google accounts, and `/__calls` lets tests prove that nothing was sent without approval. It never
calls real Google endpoints: there is no outbound HTTP code in this package.

|               |                                                                |
| ------------- | -------------------------------------------------------------- |
| Port          | `4020`                                                         |
| Run locally   | `pnpm --filter @investfund/mock-google dev`                    |
| Run in Docker | `docker compose -f infra/docker-compose.yml up -d mock-google` |

## Base URLs

One origin serves every path, so the three API settings all point at the mock. Only the consent
URL is opened by the **browser**, which cannot resolve Compose service names:

| Setting                                                   | Real Google                     | Local dev (API on the host) | Sandbox (`api` container) |
| --------------------------------------------------------- | ------------------------------- | --------------------------- | ------------------------- |
| `GOOGLE_AUTH_BASE_URL` (browser: `/o/oauth2/v2/auth`)     | `https://accounts.google.com`   | `http://localhost:4020`     | `http://localhost:4020`   |
| `GOOGLE_OAUTH2_BASE_URL` (server: `/token`, `/revoke`)    | `https://oauth2.googleapis.com` | `http://localhost:4020`     | `http://mock-google:4020` |
| `GOOGLE_API_BASE_URL` (server: userinfo, Gmail, Calendar) | `https://www.googleapis.com`    | `http://localhost:4020`     | `http://mock-google:4020` |

`https://www.googleapis.com` serves `/oauth2/v3/userinfo`, `/gmail/v1/…` and `/calendar/v3/…`, so
one API base URL is enough in production too.

## Endpoints

| Method and path                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /o/oauth2/v2/auth`                                       | No consent screen: consents as the seeded user named by `login_hint` (else the first seeded user) and redirects (302) to `redirect_uri` with `code`, `scope`, `authuser` and `state`. Supports PKCE (`S256`, `plain`), `prompt` (`none` → `consent_required` without a prior grant), `include_granted_scopes=true`, `access_type=offline`. Bad `client_id`/`redirect_uri` → 400/401 JSON, never a redirect. |
| `POST /token`                                                 | Form or JSON body; client credentials in the body or HTTP Basic. `authorization_code` (single-use code, same `redirect_uri`, PKCE verifier checked → `invalid_grant`) and `refresh_token`. A refresh token is issued only with `access_type=offline`. No `id_token` (use userinfo).                                                                                                                         |
| `GET /oauth2/v3/userinfo`                                     | `sub`; `email` and `email_verified: true` with the `email` scope; `name`, `given_name`, `family_name` with `profile`.                                                                                                                                                                                                                                                                                       |
| `POST /revoke`                                                | `token` in the query or body. Revoking a refresh token also revokes its access tokens and the stored consent.                                                                                                                                                                                                                                                                                               |
| `POST /gmail/v1/users/me/messages/send`                       | `{ raw, threadId? }`, base64url RFC 2822. Needs `gmail.send` (or `gmail.compose`, `gmail.modify`, `mail.google.com`). Returns `{ id, threadId, labelIds: ["SENT"] }`.                                                                                                                                                                                                                                       |
| `GET /gmail/v1/users/me/history`                              | `startHistoryId` (required), `historyTypes`, `labelId`, `maxResults`, `pageToken`. `messagesAdded` records only.                                                                                                                                                                                                                                                                                            |
| `GET /gmail/v1/users/me/threads/{id}`                         | `format` `full` (default), `metadata` (+ `metadataHeaders`) or `minimal`.                                                                                                                                                                                                                                                                                                                                   |
| `POST /calendar/v3/freeBusy`                                  | `items` may be `primary` or any seeded user's email; busy blocks are clipped to the window, merged and **always returned in UTC**. Unknown calendars get `errors: [{ reason: "notFound" }]`.                                                                                                                                                                                                                |
| `POST /calendar/v3/calendars/{calendarId}/events`             | Own calendar only (`primary` or own email). `start`/`end` as `dateTime` with an offset, local `dateTime` + `timeZone` (IANA), or all-day `date`. `conferenceDataVersion=1` + `conferenceData.createRequest` → `hangoutLink` and `conferenceData`. `sendUpdates` is recorded. Client-supplied `id` (base32hex) → 409 if it exists.                                                                           |
| `DELETE /calendar/v3/calendars/{calendarId}/events/{eventId}` | 204, then 410 for an already deleted event; 404 if unknown.                                                                                                                                                                                                                                                                                                                                                 |
| `GET /health`                                                 | `{ "status": "ok" }`                                                                                                                                                                                                                                                                                                                                                                                        |

Errors use Google's shapes: `{ "error": { "code", "message", "errors": [{ "reason" }], "status" }}`
for the APIs and `{ "error", "error_description" }` for OAuth endpoints.

## Test hooks

| Method and path                     | Notes                                                                                                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /__calls`                      | Every request except `/health` and `/__*`, in order: `seq`, `method`, `path`, `status`, `user`, `injected`, `detail`.                                                                                                               |
| `POST /__reset`                     | Back to the start-up state: default seed users only; calls, control rules, codes, tokens, consents, mail and events cleared; counters and the clock restart.                                                                        |
| `POST /__seed`                      | `{ users: [{ email, name, sub?, givenName?, familyName?, picture?, busy: [{ start, end }] }], accessTokens: [{ token, email, scopes }] }`. Adds or replaces users by email; `accessTokens` skip the OAuth dance in tests.           |
| `POST /__control`, `GET /__control` | Failure injection (below).                                                                                                                                                                                                          |
| `POST /__inject/reply`              | `{ threadId, from?, subject?, body? }` adds an inbound `INBOX`/`UNREAD` reply (with `In-Reply-To`/`References`) to the thread owner's mailbox, so the next `history.list` shows it. Returns `{ id, threadId, historyId, headers }`. |

`detail` holds non-secret data only: decoded mail headers (`from`, `to`, `cc`, `bcc`, `subject`,
`messageId`, `inReplyTo`, `references`) and recipients for `messages.send`; calendar ID, event ID,
`sendUpdates`, `conferenceDataVersion`, times and attendee emails for events; `grantType` and
`clientId` for `/token`. Client secrets, codes, tokens and PKCE verifiers are never recorded, and
message bodies only when `MOCK_RECORD_CONTENT=true`.

Default seed (also after `/__reset`): `founder@investfund.test` (Fay Founder; busy 09:00–10:00 and
13:30–14:00 UTC on 2026-01-05) and `investor@investfund.test` (Ian Investor; busy 11:00–12:00 UTC).

### Failure injection (`POST /__control`)

```json
{ "next": 1, "fail": "invalid_grant", "path": "/token", "retryAfter": 1, "latencyMs": 0 }
```

| `fail`                                                                | Effect                                                                                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_grant`                                                       | `/token`, `/revoke` → 400 `invalid_grant`; userinfo and APIs → 401 (expired or revoked token); consent → redirect with `error=access_denied`. |
| `access_denied`                                                       | Consent → redirect with `error=access_denied`; elsewhere 403.                                                                                 |
| `401`, `403`, `429` (+ `Retry-After`), `500`, `503` (+ `Retry-After`) | That status, in the endpoint's error shape.                                                                                                   |

`latencyMs` delays the call (alone or with `fail`). `path` limits the rule to paths starting with
that prefix. Rules queue in order (FIFO) and each matching call consumes one of `next`.

## Determinism

Codes (`4/0mock-code-000001`), access tokens (`ya29.mock-access-000001`), refresh tokens
(`1//0mock-refresh-000001`), message IDs, history IDs and event IDs (`mockevt000001`) come from
counters; `sub` is derived from the email; Meet links from the event ID. Timestamps come from a
clock that starts at `MOCK_NOW` and advances one second per created object. Replaying the same
calls after `/__reset` gives the same output.

## Environment

| Variable                                              | Default                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| `PORT` / `HOST`                                       | `4020` / `127.0.0.1` (the image uses `0.0.0.0`) |
| `MOCK_NOW`                                            | `2026-01-05T08:00:00Z`                          |
| `MOCK_GOOGLE_CLIENT_ID` / `MOCK_GOOGLE_CLIENT_SECRET` | unset: any client is accepted                   |
| `MOCK_RECORD_CONTENT`                                 | `false`                                         |

## Limits (P0)

No consent screen, no `id_token`/JWKS, no Pub/Sub push, no `/upload/` media endpoints, no
`users.getProfile`, no shared calendars. Free/busy ignores `timeZone` (UTC output). These can be
added when a feature needs them.
