# ADR 0003: Real-time delivery with SSE and PostgreSQL, email via a transactional outbox

Date: 2026-10-10 · Status: Accepted

## Context
Chat and notifications need real-time delivery. The brief suggests a managed real-time provider
"compatible with the deployment platform". It also says not to add infrastructure without a
demonstrated need, and not to present polling as real time. The API is a long-running Node
process (not serverless), and PostgreSQL is already required.

Options considered:

| Option | Cost | Ops | Testable locally | Authorisation model |
|---|---|---|---|---|
| Pusher / Ably (managed WebSockets) | Free tier, then per-connection/message fees | Vendor account, secrets, webhook for channel auth | Needs credentials | Private channels with a server auth endpoint |
| Supabase Realtime | Tied to Supabase Postgres | Second auth system (RLS) | Partly | RLS policies |
| **SSE from the API + PostgreSQL LISTEN/NOTIFY fan-out** | None beyond the API host | None new | Fully | Server pushes only the caller's events |

## Decision
- `GET /api/v1/realtime/stream` is an authenticated Server-Sent Events stream, one per tab. The
  server decides what each user receives. No client-chosen channel names exist, so there is
  nothing to subscribe to illegitimately.
- Producers persist first, then publish **after commit** (`Effects.flush`) through a
  `RealtimeBus` adapter:
  - `PostgresRealtimeBus`: `pg_notify` and `LISTEN` on a dedicated connection. Every API
    instance receives every event and forwards it to its local streams. This supports several
    instances behind a load balancer. Payloads over ~7 KB are sent as id-only references.
  - `MemoryRealtimeBus`: single process (tests).
- Clients treat events as hints, refetch on reconnect, and send messages with a client-generated
  `clientMessageId`, so retries are idempotent and nothing is lost on disconnect.
- A managed provider (Ably or Pusher) can be added later as another `RealtimeBus` plus a client
  transport, if the hosting platform cannot hold long-lived HTTP connections.

**Email.** Notifications and their email are written in the same transaction as the domain
change (`notifications` and `email_outbox`, deduplicated by unique keys). `EmailDispatcher`
delivers the email asynchronously with `FOR UPDATE SKIP LOCKED`, retries with exponential
backoff, and marks rows `failed` after 5 attempts. The transport sits behind `EmailSender`:
SMTP (any provider) or `log` when no provider is configured. The `log` transport never claims
delivery (rows become `skipped`).

## Consequences
- The hosting platform must support long-lived HTTP responses (Render, Fly.io, Railway and
  containers do; most serverless function platforms do not). See `docs/OPERATIONS.md`.
- Each open stream holds a socket, not a database connection. Each API instance holds one extra
  PostgreSQL connection for `LISTEN`. A transaction-mode pooler (PgBouncer) does not support
  `LISTEN`, so that connection must use a direct or session-mode URL.
- Delivery is at-least-once for email (a crash after the provider accepts a message can repeat
  that one email). It is at-most-once for real-time hints, which is acceptable because the data
  is always refetched from the API.
