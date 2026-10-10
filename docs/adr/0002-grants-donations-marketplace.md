# ADR 0002: Pivot to a grants-and-donations fundraising marketplace

Date: 2026-10-10 · Status: Accepted (from the human's master brief, 2026-10-10)

## Context
The human's new master brief redefines the product. It is now a two-sided marketplace where
technology founders raise **grants and donations** from individual supporters. Discovery,
connection, chat, structured negotiation and reported outcomes are in scope. It replaces the
equity-investment, AI-matching and Gmail/Calendar scope of PRD v1 (archived in
`docs/archive/PRD_v1_equity_ai.md`). The brief also asks us to keep existing conventions when
useful code already exists.

## Decision
1. **Scope.** The P0 MVP is the one in `docs/PRD.md`. The following are out of scope: equity,
   valuation, in-platform payments, legal contract execution, AI matching, Gmail outreach and
   Calendar booking.
2. **Architecture kept.** We keep the pnpm monorepo: Express API (`apps/api`), Next.js web
   (`apps/web`) and shared Zod contracts (`packages/shared`). We do not move to Next.js Route
   Handlers. The existing API foundation (config, logging, problem+json, rate limiting, crypto,
   storage, CI) is reused. Rewriting it would add risk without benefit.
3. **Authentication.** Google sign-in only, implemented server-side as an OAuth 2.0
   authorization-code flow with PKCE and `state` in a signed httpOnly cookie. The identity comes
   from Google's `userinfo` endpoint, fetched with the token from the back channel. Sessions use
   the existing design: a 15-minute HS256 access token in memory, plus a rotating refresh token
   (hashed at rest) in an httpOnly `SameSite=Lax` cookie scoped to `/api/v1/auth`, with reuse
   detection. Email/password, argon2 and email verification are dropped.
   - Why not Auth.js or a hosted IdP: the API is a separate Express service and is the
     authorisation authority. Auth.js is built for Next.js route handlers. A hosted IdP would
     add a vendor and cost for a single provider. `jose` (already approved) signs the tokens.
4. **Roles.** A user has no role until onboarding, then chooses `founder` or `supporter` once.
   `admin` is granted only by an operator command (`pnpm --filter @investfund/api admin:grant`).
   The guards re-read the role and status from the database on every request, so suspension and
   onboarding take effect immediately.
5. **Matching.** Deterministic weighted scoring (`docs/MATCHING.md`). No LLM.
6. **Money.** BIGINT minor units plus an explicit ISO 4217 `currency` on every amount (GBP
   default; EUR and USD allowed). No conversion is ever performed.
7. **Testing identity provider.** `infra/mocks/google` (already built) implements the OAuth
   code flow with PKCE. E2E tests and local development point the Google base URLs at it, so
   the real production code path runs in tests. Integration tests inject a fake
   `IdentityProvider`.

## Consequences
- Large parts of the v1 docs (PRD, DATABASE, API, phase plan) are archived and replaced.
- Redis, BullMQ, the LLM adapter and mock-llm are not needed. Background work (email outbox,
  offer expiry) runs in-process on PostgreSQL (`FOR UPDATE SKIP LOCKED`). See ADR 0003.
- New dependencies: `pg` (LISTEN/NOTIFY for real-time fan-out) and `nodemailer` (SMTP
  adapter), with `@types/*`. Also `@playwright/test` for E2E (already on the approved stack).
