# Decisions log

| Date | Gate | Scope | Outcome |
|---|---|---|---|
| 2026-10-08 | Interview | Stack, MVP scope, workflow (see PRD §3, ADR 0001) | Decided by human |
| 2026-10-08 | A | Phase plan P0–P10, DATABASE.md, API.md, P0 task cards; assumptions A1–A12 and decisions D1–D12 accepted as proposed | Approved |
| 2026-10-08 | X | P0 dependency list (PHASE_PLAN §6, P0 row) + docker images pgvector/pgvector:pg16, redis:7, axllent/mailpit, Playwright browsers; pnpm via corepack. CI file still needs its own Gate X | Approved |
| 2026-10-09 | X | H1: @tailwindcss/postcss, @types/react, @types/react-dom, @types/node now; jsdom, @testing-library/dom, eslint-plugin-react-hooks with P0-TEST-01. H2: image pins pgvector/pgvector:0.8.7-pg16, redis:7.4.11-alpine, axllent/mailpit:v1.31.4. H3: node:22-alpine (exact pin) base image | Approved |
| 2026-10-09 | B | P0 wave 2 review items: INFRA-01 AC1 deferred to MOCK-01/02, AC3 + Dockerfiles to API-01/WEB cards (H3); HealthReport shape, Job.type string until P2 (H4); CSP 'unsafe-inline' in P0, nonce CSP tracked for P1 (H5) | Approved |
