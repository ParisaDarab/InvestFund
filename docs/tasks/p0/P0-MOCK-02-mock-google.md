# P0-MOCK-02: Mock Google server skeleton (OAuth, Gmail, Calendar subset)
Owner: tester        Estimate: M
Requirements: NFR-AI-01, NFR-REL-01, FR-OUT-02, FR-MEET-01 (testability)
Depends on: P0-REPO-01, P0-INFRA-01

## Goal
An HTTP mock of the Google endpoints InvestFund uses, so that sign-in, Gmail and Calendar flows run in CI and the sandbox without real Google accounts, and so that tests can prove that nothing was sent without approval (`/__calls`).

## Scope
- In: `infra/mocks/google` (Express + TypeScript): OAuth 2.0 `GET /o/oauth2/v2/auth` (auto-consent page or redirect with a code; supports `state`, PKCE `S256`, `prompt`, `include_granted_scopes`), `POST /token` (authorization_code and refresh_token grants, validates PKCE verifier, returns scopes), `GET /oauth2/v3/userinfo`, `POST /revoke`; Gmail `POST /gmail/v1/users/me/messages/send`, `GET /gmail/v1/users/me/history`, `GET /gmail/v1/users/me/threads/{id}`; Calendar `POST /calendar/v3/freeBusy`, `POST /calendar/v3/calendars/{calendarId}/events` (supports `conferenceDataVersion=1`, `sendUpdates`), `DELETE /calendar/v3/calendars/{calendarId}/events/{eventId}`; in-memory state with seedable test users (`POST /__seed`); `GET /__calls`, `POST /__reset`; `POST /__control` (inject 401 `invalid_grant`, 429, 500, latency); `POST /__inject/reply` (adds an inbound message to a thread for reply tracking); `GET /health`; Dockerfile; README.
- Out: real Google behaviour beyond this subset; Pub/Sub push (deferred).

## Contracts / inputs
- Endpoints: the Google REST shapes above, at the level used by `googleapis` / `@googleapis/*` clients
- Schemas: internal to the mock
- Tables: none

## Acceptance criteria
1. Given an authorise request with `state` and a PKCE challenge, When the mock redirects back, Then the code exchanges at `/token` only with the matching verifier; a wrong verifier returns 400 `invalid_grant`.
2. Given an access token from `/token`, When `/oauth2/v3/userinfo` is called, Then it returns the seeded user's `sub`, `email`, `email_verified: true` and `name`.
3. Given a valid token, When `messages.send` is called with a base64url RFC 2822 message, Then it returns `{ id, threadId }` and `/__calls` records the call with the decoded headers (To, Subject).
4. Given `POST /__inject/reply` for a thread, When `history.list` is called with the previous `historyId`, Then the new message appears.
5. Given `freeBusy` for a seeded calendar with busy blocks, When queried for a window, Then the busy blocks in that window are returned in UTC.
6. Given `events.insert` with `conferenceDataVersion=1`, When called, Then the response includes an event `id` and a `hangoutLink`.
7. Given `POST /__control { "next": 1, "fail": "invalid_grant" }`, When a refresh-token grant is made, Then it returns 400 `invalid_grant`.
8. Given `POST /__reset`, When `/__calls` is read, Then it is empty and all state is cleared.

## Test requirements
- Unit: PKCE verification, base64url MIME decoding, free/busy window filtering.
- Integration: Supertest for every endpoint, plus one test through the official Google client library pointed at the mock base URL.
- E2E / non-functional: health check included in P0-TEST-02.

## Notes / risks
- The mock must never call real Google endpoints.
- Base URLs must be overridable in the API config (`GOOGLE_*_BASE_URL`); coordinate the variable names with the Backend agent and add them to `.env.example`.
