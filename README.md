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

## Local infrastructure (Docker Compose)

Prerequisite: Docker Desktop (WSL2 backend on Windows) or Docker Engine with Compose v2.

```bash
pnpm infra:up            # docker compose -f infra/docker-compose.yml up -d: postgres, redis, mailpit
pnpm infra:health        # waits until every service is healthy and checks the vector/citext extensions
pnpm infra:logs          # follow logs (append a service name, e.g. `pnpm infra:logs postgres`)
pnpm infra:down          # stop and remove containers; named volumes (your data) are kept
pnpm check:compose       # static check: ports bound to 127.0.0.1, pinned image tags, sandbox isolation
```

| Service     | Image                           | Host address (127.0.0.1 only)                     |
| ----------- | ------------------------------- | ------------------------------------------------- |
| postgres    | `pgvector/pgvector:0.8.7-pg16`  | `localhost:5432` (user, password, db: investfund) |
| redis       | `redis:7.4.11-alpine`           | `localhost:6379`                                  |
| mailpit     | `axllent/mailpit:v1.31.4`       | SMTP `localhost:1025`, UI http://localhost:8025   |
| mock-llm    | built from `infra/mocks/llm`    | `localhost:4010` (profiles `mocks`, `sandbox`)    |
| mock-google | built from `infra/mocks/google` | `localhost:4020` (profiles `mocks`, `sandbox`)    |

Profiles:

- `mocks` starts the mock LLM and mock Google servers as well: `docker compose -f infra/docker-compose.yml --profile mocks up -d`. They become part of the default set once their code lands (P0-MOCK-01/02).
- `sandbox` adds the `api`, `worker` and `web` containers. `api` and `worker` run on the internal `investfund-sandbox` network with **no internet egress** and talk only to postgres, redis, mailpit and the mocks. `web` is published on http://localhost:3000. Start it with `docker compose -f infra/docker-compose.yml --profile sandbox up -d --build` and check it with `node infra/scripts/compose-health.mjs --profile sandbox`.

Data lives in the named volumes `postgres-data`, `redis-data`, `mailpit-data` and `api-storage`, so it survives `down` and restarts. `docker compose ... down -v` **deletes all data** and needs explicit approval (see `CLAUDE.md` §5). The Postgres init script `infra/postgres/init/01-extensions.sql` only runs when the data volume is first created.

### Docker on Windows

- Use Docker Desktop with the WSL2 backend and run commands from the WSL2 distribution when possible. Bind mounts from the Windows filesystem (`C:\...` or `/mnt/c/...`) are much slower than from the Linux filesystem (`~/src/...`).
- The stack keeps database files in named volumes (not bind mounts), so database performance does not depend on where the repository is checked out.
- If ports 5432, 6379, 1025 or 8025 are already taken (for example by a local PostgreSQL service), override them, e.g. `POSTGRES_PORT=55432 pnpm infra:up`, and update `DATABASE_URL` in `.env`.
- Give Docker Desktop at least 4 GB of memory (Settings → Resources) for the full sandbox profile.
