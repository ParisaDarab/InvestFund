# InvestFund: re-scoped delivery plan (v2)

Status: **approved (Gate A) by the human on 2026-10-09.** It supersedes the original plan, archived at `docs/archive/PHASE_PLAN_v1.md`.
Source: re-scoping interview with the human on 2026-10-09.

## 1. Why re-scope

The original plan (P0–P10) had phases far larger than one Claude session. Work was repeatedly cut off by the session usage limit. In this plan:

- **One session is one unit of work.** A session must finish (implement, test, commit approval) before the usage limit. In practice that means **1–2 small task cards per session**.
- **Lean per-session process:** one specialist agent implements the card and writes its tests. The orchestrator runs lint, typecheck and tests, and the human approves the commit (Gate B). Supervisor planning and review run **only at release boundaries** (Gate A / Gate D), not in every session.
- **Releases replace phases.** Each release is a demoable outcome made of numbered sessions.

## 2. Interview decisions

| Topic | Decision |
|---|---|
| First release | Profiles and browsing. No AI, outreach or meetings. |
| Sign-in (R1) | Email and password only: register, verify email, log in, reset password. Google sign-in comes later. |
| Profile depth (R1) | Core fields only (below). The full wizard sections come later. |
| R1 extras | Search and filters, marketing site, investor verification |
| Visibility (R1) | A startup's profile and deck are visible **only to logged-in, admin-verified investors**. Founders cannot see other startups. Founders can browse verified investors. Full visibility tiers (PRD §7) come with matching. |
| Investor verification | Investor self-certification, then a minimal admin page (pending list, approve/reject). The admin account is created by a seed command. |
| Phase 0 kept | Postgres and Prisma, CI pipeline. **Deferred:** Redis and the BullMQ worker (until AI jobs), mock-llm and mock-google (already built; parked as-is until the AI and Google releases). |
| Removed from MVP | The agentic AI assistant (FR-AI-08), moved to "later". |
| Order after R1 | AI first: deck extraction, then matching, then analyzer, then Google, Gmail, Calendar, messaging, admin console, and finally privacy and hardening. |

### Core profile fields (R1)
- **Startup:** company name, one-liner, sector(s), stage, UK location, amount raising (GBP), website, pitch deck upload (PDF, size-limited).
- **Investor:** display name, investor type (angel / VC / family office-CVC / syndicate / accelerator), sectors, stages, cheque size min–max (GBP), location, short bio, self-certification category plus a declaration.

## 3. Sessions

Every session ends with green checks and a Gate B commit request. "Card" means a task card in `docs/tasks/`.

### R0: Foundations (lean finish)
| # | Session | Contents |
|---|---|---|
| S0.1 | Stabilise and commit | Fix the work the usage limit interrupted (finish removing the mock type stubs, repair the half-edited `docs/API.md`). Decide P0-API-01 open questions Q1–Q5. Run all checks, then commit the existing web tokens, API skeleton and mocks as separate commits. |
| S0.2 | Database | P0-DB-01: Prisma init, a first migration (`citext`, `vector`), and a DB check in `/health/ready`. Redis is removed from readiness for now. |
| S0.3 | Core security | P0-API-02 (trimmed): helmet, CORS allowlist, `validate()` middleware, AES-256-GCM crypto, the local-disk `StorageProvider`, a JWT auth-guard skeleton, and a rate limiter backed by **Postgres or in-memory** (no Redis; decision needed). |
| S0.4 | CI | P0-CI-01: GitHub Actions running lint, typecheck, unit and integration tests (**Gate X: CI change**). |
| S0.5 | Web API client | P0-WEB-04: typed fetch client with problem+json parsing. |

Dropped from R0 and moved to the release that first needs them: P0-API-03 (worker queues), P0-TEST-02 (sandbox smoke with mocks), the Playwright/E2E part of P0-TEST-01 (moved to S1.10), and P0-WEB-03 (marketing shell, now S1.9).

### R1: Profiles and browse (first usable release)
| # | Session | Contents |
|---|---|---|
| S1.1 | Identity schema and register | `users`, `auth_tokens`, `consent_records`, `audit_logs`. Register, plus verify email (SMTP to Mailpit). |
| S1.2 | Login and sessions | Login (argon2id, lockout), refresh-token rotation, logout, forgot/reset password. |
| S1.3 | Auth UI | Register (role choice), login, verify, forgot and reset pages; auth state; role guards. |
| S1.4 | App shell | Role-aware sidebar and top bar, empty dashboards, account settings. |
| S1.5 | Startup profile API | Startup table, CRUD with ownership checks, deck upload and download through `StorageProvider`. |
| S1.6 | Startup profile UI | Founder profile form, deck upload, publish toggle. |
| S1.7 | Investor profile and self-certification | API and UI for the investor profile and self-certification; status `pending_verification`. |
| S1.8 | Admin verification | Admin seed command, admin role, pending-investor queue API and a minimal admin page (approve/reject, audit logged). |
| S1.9 | Browse and search | List and detail endpoints with filters (sector, stage, location, cheque/raise range), plus pagination, visibility enforcement and the browse UI on both sides. |
| S1.10 | Marketing site | Landing, How it works, For founders, For investors, FAQ, Privacy, Terms (placeholder legal text), and an essential-cookies notice. |
| S1.11 | R1 sign-off | Playwright E2E for the founder, investor and admin journeys, an axe check, the R1 test report and supervisor review (Gate D). |

### Later releases (each split into sessions at its own Gate A)
| Release | Outcome |
|---|---|
| R2 | AI deck extraction: LLM adapter, `llm_settings`, Redis and the worker return, mock-llm resumed, and extracted facts that pre-fill the startup profile. Extended profile sections. |
| R3 | AI matching and double opt-in: ranked, explained matches, connections, full visibility tiers, core notifications. |
| R4 | Startup analyzer and deck coach |
| R5 | Google sign-in (mock-google resumed) |
| R6 | Campaigns and Gmail outreach (approval records) |
| R7 | Calendar meetings |
| R8 | Messaging and notification centre |
| R9 | Admin console (users, moderation, LLM settings UI, weights, analytics, audit log) |
| R10 | Privacy (export and deletion, retention) and release hardening |
| Later | Agentic AI assistant (FR-AI-08) |

## 4. Decisions (approved by the human on 2026-10-09)

1. This plan is approved (Gate A). It replaces the v1 plan, and the P0 task-card README is updated.
2. The R1 rate-limit store is **Postgres-backed** (no Redis until R2).
3. The workflow in `CLAUDE.md` §4 is changed to the lean per-session process.
