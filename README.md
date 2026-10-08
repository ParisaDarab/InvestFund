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

| Agent      | Prompt                         | Skills                                                                                             |
| ---------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Supervisor | `.claude/agents/supervisor.md` | requirements-to-tasks, phase-planning, database-design, api-contract-design, code-review-standards |
| Backend    | `.claude/agents/backend.md`    | express-module, prisma-data-layer, llm-integration, google-integrations                            |
| Frontend   | `.claude/agents/frontend.md`   | ui-design-system, nextjs-feature, api-client-integration                                           |
| Tester     | `.claude/agents/tester.md`     | test-automation, e2e-testing, sandbox-simulation, nonfunctional-testing                            |
| All        | n/a                            | human-approval-gate                                                                                |

## Stack

Next.js · Express · TypeScript · PostgreSQL + Prisma + pgvector · Redis/BullMQ · Docker Compose · GitHub Actions

## Getting started

Prerequisites: Node.js 22 LTS (see `.nvmrc`) and pnpm 12 via Corepack.

```bash
corepack enable          # provides the pnpm version pinned in package.json
pnpm install
pnpm lint                # ESLint (typescript-eslint strict-type-checked), zero warnings allowed
pnpm typecheck           # tsc --noEmit for the root and every package
pnpm format:check        # Prettier
pnpm test                # Vitest; one project per workspace package
pnpm check:eol           # fails if any tracked text file is stored with CRLF
```

Workspace layout: `apps/web` (Next.js), `apps/api` (Express), `packages/shared` (Zod contracts), `packages/test-utils`, `infra/mocks/*`.

### Windows note

The repository stores every text file with LF line endings (`.gitattributes`, `.editorconfig`), so Windows and Linux CI produce identical diffs. On Windows:

- Prefer **WSL2** (Ubuntu) with the repository cloned inside the Linux filesystem (`~/src/...`, not `/mnt/c/...`) for the best file-watching and Docker performance. Docker Desktop must use the WSL2 backend.
- If you work natively on Windows, use Git Bash or PowerShell and set `git config core.autocrlf false`; `.gitattributes` handles normalisation.
- If a file was committed with CRLF, run `git add --renormalize .` and then `pnpm check:eol`.
