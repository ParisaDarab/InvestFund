# Test strategy

## Pyramid
| Level | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest | services, scorers, utilities, schemas, components | every commit / CI |
| Integration | Vitest + Supertest + Testcontainers | every API endpoint incl. authz and visibility | CI |
| Contract | Shared Zod schemas parsed on both sides; OpenAPI diff check | CI |
| E2E | Playwright + axe | user journeys in the sandbox | CI (sandbox), phase end |
| Simulation | `infra/sim` scenarios | multi-actor flows, failure injection | phase end |
| Performance | k6, Lighthouse CI | budgets below | phase end |
| Security | custom suites + `pnpm audit` | OWASP API Top 10, prompt injection | phase end |

## Budgets
| Metric | Target |
|---|---|
| API CRUD read p95 | < 200 ms |
| API CRUD write p95 | < 400 ms |
| Match list p95 | < 300 ms |
| AI job enqueue p95 | < 300 ms |
| Landing LCP | < 2.5 s |
| Coverage API modules | ≥ 80% |
| Coverage web | ≥ 70% |
| Serious or critical a11y violations | 0 |

## Mocks and data
- Mock LLM (OpenAI-compatible, fixture-driven), mock Google APIs (Gmail and Calendar subset), Mailpit
- Synthetic UK founders and investors with a fixed seed. No real personal data.

## Invariants that must always be tested
1. No email is sent or calendar event created without an approved ApprovalRecord whose payload hash matches.
2. An investor never receives gated startup fields before connection, through any endpoint.
3. Uploaded document content cannot trigger tool calls beyond drafting.
4. Secrets and tokens never appear in API responses or logs.
