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

## Lifecycle of a phase

1. **Plan.** The orchestrator asks the supervisor for the phase plan, schema and API delta, and the task cards. → **Gate A**: the human approves or requests changes.
2. **Branch.** `feature/p<N>-<slug>` from `main`.
3. **Build.** For each task card, in dependency order:
   1. Contract card (Backend) → supervisor review
   2. Backend and Frontend cards (in parallel when independent)
   3. Tester writes and runs tests and produces a report
   4. Supervisor standards review (PASS / CHANGES)
   5. **Gate B**: the human approves the commit. The orchestrator commits.
4. **Publish.** **Gate C**: the human approves the push and PR. The orchestrator pushes and opens the PR. The human reviews and merges (or asks the orchestrator to merge).
5. **Close phase.** The tester runs the phase-level E2E, non-functional tests and sandbox simulation → `docs/test-reports/phase-N.md`. → **Gate D**: the human signs off and the next phase starts.

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
