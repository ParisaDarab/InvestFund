---
name: database-design
description: Supervisor procedure for designing and evolving the PostgreSQL data model (docs/DATABASE.md) that the Backend implements in Prisma. Use when adding entities, relationships, indexes, vector columns, or retention/privacy rules.
---

# Database design

## Deliverable: `docs/DATABASE.md`

1. **Mermaid ERD** of all entities.
2. **Per table:** purpose, columns (name, type, nullability, default), PK and FKs (with on-delete behaviour), unique constraints, indexes (and the query they serve), PII classification (none/personal/sensitive) and retention rule.
3. **Enums** listed centrally (for example `UserRole`, `FundingRound`, `InstrumentType`, `MatchStatus`, `ApprovalStatus`).
4. **Migration notes:** additive vs destructive, and the backfill plan.

## Conventions

- Table names `snake_case` plural through Prisma `@@map`; models in PascalCase.
- `id` is a UUID v7 (`uuid` type), and every table has `created_at` and `updated_at`. Use soft delete (`deleted_at`) only where audit requires it.
- Money is stored as `amount_minor BIGINT` plus `currency CHAR(3)` (default `GBP`). Never use floats.
- Percentages are `NUMERIC(5,2)`.
- Flexible-but-validated data (such as extracted document facts) goes in `JSONB` with a Zod schema version field.
- Embeddings use `vector(<dim>)` through pgvector, with an HNSW index and cosine distance. The dimension comes from the configured embedding model and is recorded in an ADR.
- Secrets and tokens (OAuth refresh tokens, demo credentials, LLM key) are stored as encrypted `BYTEA` plus a key version.
- Add an audit table for approvals and security events (append-only).

## Core aggregates (starting point)

User/Auth (users, sessions, oauth_accounts, investor_certifications) · Startup (startups, founders, products, traction_metrics, funding_rounds, use_of_funds, documents, document_extractions) · Investor (investor_profiles, investment_theses, portfolio_companies, investor_team_members) · Matching (embeddings, match_runs, matches, match_scores, interests) · Analysis (startup_analyses, deck_reviews) · Outreach (campaigns, email_drafts, email_threads, approval_records) · Meetings (meeting_proposals, meetings) · Messaging (conversations, messages) · Notifications · Admin (llm_settings, matching_weights, audit_logs).
