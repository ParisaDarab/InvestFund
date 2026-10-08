# InvestFund

AI-powered platform that matches UK startups seeking investment with investors seeking opportunities. It provides two-sided AI matching, startup and pitch deck analysis, and approval-controlled outreach and meeting scheduling through Gmail and Google Calendar.

> Status: project setup. Application code has not been written yet.

## Documentation
- [Master prompt / contributor rules](CLAUDE.md)
- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Benchmark analysis](docs/BENCHMARK_ANALYSIS.md)
- [Workflow and approval gates](docs/WORKFLOW.md)
- [Test strategy](docs/TEST_STRATEGY.md)

## AI agent team (Claude Code)
| Agent | Prompt | Skills |
|---|---|---|
| Supervisor | `.claude/agents/supervisor.md` | requirements-to-tasks, phase-planning, database-design, api-contract-design, code-review-standards |
| Backend | `.claude/agents/backend.md` | express-module, prisma-data-layer, llm-integration, google-integrations |
| Frontend | `.claude/agents/frontend.md` | ui-design-system, nextjs-feature, api-client-integration |
| Tester | `.claude/agents/tester.md` | test-automation, e2e-testing, sandbox-simulation, nonfunctional-testing |
| All | n/a | human-approval-gate |

## Stack
Next.js · Express · TypeScript · PostgreSQL + Prisma + pgvector · Redis/BullMQ · Docker Compose · GitHub Actions
