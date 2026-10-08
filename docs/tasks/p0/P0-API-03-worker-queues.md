# P0-API-03: Worker entry point and BullMQ queue foundation
Owner: backend        Estimate: S
Requirements: NFR-REL-01, NFR-OBS-01
Depends on: P0-API-01, P0-INFRA-01

## Goal
A second entry point in `apps/api` that runs background jobs from Redis, with the conventions that later AI, email and calendar jobs rely on: named queues, retry with exponential backoff, idempotent job IDs, structured logs and graceful shutdown.

## Scope
- In: `src/worker.ts` (entry; shares config, logger and container with the API); `core/queue` (`QueueFactory` creating BullMQ queues and workers from one ioredis connection config; default job options: 3 attempts, exponential backoff starting at 2 s, `removeOnComplete` age 24 h, `removeOnFail` age 7 days; caller-supplied `jobId` for idempotency); a `system` queue with a `noop` job used by tests and the health check; per-job log context (job ID, type, attempt) without payload logging; queue depth metrics on the worker's metrics port; `pnpm --filter api dev:worker` and inclusion in `pnpm dev`.
- Out: `job_runs` table and `GET /jobs` (P2); domain jobs.

## Contracts / inputs
- Endpoints: none
- Schemas: none
- Tables: none

## Acceptance criteria
1. Given Redis is up, When the API enqueues a `noop` job, Then the worker processes it and the job state becomes `completed`.
2. Given a job that throws twice then succeeds, When processed, Then it completes on attempt 3 with backoff delays of at least 2 s and 4 s (fake timers or measured).
3. Given two enqueues with the same `jobId`, When processed, Then the handler runs once.
4. Given SIGTERM while a job is running, When the worker shuts down, Then the current job finishes (or is returned to the queue) and the process exits 0 within 30 s.
5. Given a job payload containing `{ token: "x" }`, When the worker logs the job, Then the payload is not logged.

## Test requirements
- Unit: default job options, log context builder.
- Integration: Testcontainers Redis with a real worker for criteria 1–4.
- E2E / non-functional: none.

## Notes / risks
- Keep the worker and API as separate processes so that AI jobs never block HTTP latency.
