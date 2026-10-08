# P0-INFRA-01: Docker Compose infrastructure
Owner: backend        Estimate: M
Requirements: NFR-OBS-01, NFR-SEC-01 (sandbox isolation)
Depends on: P0-REPO-01

## Goal
One command brings up every backing service the app and tests need, both locally and in an isolated `sandbox` profile where the app containers have no internet egress.

## Scope
- In: `infra/docker-compose.yml` with `postgres` (`pgvector/pgvector` PG 16, pinned tag), `redis` (pinned 7.x alpine), `mailpit` (pinned), and `mock-llm` and `mock-google` service definitions (built from `infra/mocks/*`; their logic is in P0-MOCK-01/02); healthchecks for every service; named volumes; ports bound to `127.0.0.1`; a `sandbox` profile that adds `api`, `worker` and `web` containers (multi-stage Dockerfiles in `apps/api` and `apps/web`, non-root user) on an `internal: true` network, configured with the mock base URLs; `infra/postgres/init/01-extensions.sql` (`vector`, `citext`); `infra/scripts/compose-health.mjs` (waits for health and checks extensions); `.env.example` additions for any new non-secret variables; README commands for up, down and logs.
- Out: production deployment, seed data (later phases), mock-server logic.

## Contracts / inputs
- Endpoints: none
- Schemas: none
- Tables: none (extensions only)
- Env: `DATABASE_URL`, `REDIS_URL`, `SMTP_*` from `.env.example`

## Acceptance criteria
1. Given Docker is running, When `docker compose -f infra/docker-compose.yml up -d` runs, Then `postgres`, `redis`, `mailpit`, `mock-llm` and `mock-google` all report `healthy` within 60 s.
2. Given the database is up, When `SELECT extname FROM pg_extension` runs, Then `vector` and `citext` are listed.
3. Given the `sandbox` profile is up, When a command inside the `api` container requests `https://example.com`, Then it fails (no egress); When it requests `http://mock-llm:<port>/health`, Then it gets 200.
4. Given the compose file, When inspected by a test script, Then every published port is bound to `127.0.0.1` and no image uses the `latest` tag.
5. Given `docker compose ... down` **without** `-v`, When the stack is started again, Then database data persists in the named volume.

## Test requirements
- Unit: none.
- Integration: `infra/scripts/compose-health.mjs` (reused by P0-TEST-02 and CI); a lint script that checks criterion 4.
- E2E / non-functional: start-up time recorded in `docs/test-reports/phase-0.md`.

## Notes / risks
- `docker compose down -v` deletes data and is gated in `.claude/settings.json`. Do not run it without approval.
- Windows hosts need Docker Desktop with the WSL2 backend. Document file-sharing performance tips in the README.
