# ADR 0001: Technology stack

Date: 2026-10-08 · Status: Accepted (from the human interview)

## Context
We need a two-sided AI matching platform with web UI, REST API, relational data plus vector search, background AI jobs, and Google integrations. The team is AI agents under human approval, so we want a mainstream, strongly-typed stack.

## Decision
- pnpm monorepo, TypeScript strict everywhere
- Frontend: Next.js App Router, Tailwind CSS, shadcn/ui, next-intl, TanStack Query, React Hook Form + Zod
- Backend: Node.js + Express, layered modular monolith, REST + OpenAPI generated from shared Zod schemas
- Data: PostgreSQL 16 + Prisma + pgvector; Redis + BullMQ for jobs
- Storage: local disk behind a `StorageProvider` interface
- AI: an OpenAI-compatible API through an adapter; Base URL, key and model are admin-configured
- Auth: email/password (argon2id) + Google OAuth; JWT access + rotating refresh cookie
- Tests: Vitest, Supertest, Testcontainers, Playwright, MSW, k6
- Infra: Docker Compose; GitHub Actions CI

## Consequences
- Shared Zod schemas give one source of truth for validation and types.
- Prisma needs raw SQL for vector queries (parameterised `$queryRaw`).
- Local-disk storage limits horizontal scaling. Moving to S3 is a later ADR.
- The restricted Gmail scopes need Google verification before a public launch.
