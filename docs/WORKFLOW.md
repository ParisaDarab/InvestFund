# Development workflow and approval gates

## Roles
| Role | Who | Does |
|---|---|---|
| Human (product owner) | You | Sets requirements, approves gates A–D and X |
| Orchestrator | Main Claude session | Talks to the human, invokes agents, enforces gates, commits and pushes after approval |
| Supervisor | `.claude/agents/supervisor.md` | Plans, designs the DB and API, writes task cards, reviews |
| Backend | `.claude/agents/backend.md` | Implements the API, data layer and integrations |
| Frontend | `.claude/agents/frontend.md` | Implements the UI and API integration |
| Tester | `.claude/agents/tester.md` | Tests, sandbox simulation, reports |

## Lifecycle of a release (lean, session-sized; adopted 2026-10-09)

The plan is a set of **releases** (R0, R1, …), each made of numbered **sessions** (`docs/PHASE_PLAN.md`). A session must finish before the Claude usage limit, so it covers 1–2 small task cards.

1. **Plan (release start).** The supervisor writes the release's session list, schema and API delta, and task cards. → **Gate A**.
2. **Branch.** `feature/r<N>-<slug>` from `main` (R0 continues on `feature/p0-foundations`).
3. **Each session:**
   1. ONE specialist agent implements the card together with its unit and integration tests. Contract changes go in the same card.
   2. The orchestrator runs lint, typecheck, tests and build, and checks the acceptance criteria against the card.
   3. **Gate B**: the human approves the commit. The orchestrator commits.
   4. If the budget runs short, stop at a green point and record what remains in the card.
4. **Close release.** The tester runs E2E and non-functional tests → `docs/test-reports/r<N>.md`. The supervisor reviews the release diff against the standards. → **Gate C** (push/PR), then **Gate D** (sign-off).

The previous per-card flow (supervisor review plus tester on every card) is retired. See `docs/archive/PHASE_PLAN_v1.md` for the original plan.

Gate X (special approvals) can happen at any point. See skill `human-approval-gate`.

## Task cards
Stored in `docs/tasks/p<N>/`. The template is in skill `requirements-to-tasks`. Status is tracked in `docs/tasks/p<N>/README.md`:

| ID | Title | Owner | Status | Commit |
|---|---|---|---|---|

Status values: `todo → in-progress → in-review → approved → committed`.

## Artifacts
| Artifact | Owner | Location |
|---|---|---|
| PRD | Human + Supervisor | `docs/PRD.md` |
| Phase plan | Supervisor | `docs/PHASE_PLAN.md` |
| Data model | Supervisor (design), Backend (Prisma) | `docs/DATABASE.md`, `apps/api/prisma/schema.prisma` |
| API contract | Supervisor (design), Backend (schemas) | `docs/API.md`, `packages/shared` |
| ADRs | Supervisor | `docs/adr/` |
| Test strategy and reports | Tester | `docs/TEST_STRATEGY.md`, `docs/test-reports/` |
| Decisions log | Orchestrator | `docs/DECISIONS_LOG.md` |
