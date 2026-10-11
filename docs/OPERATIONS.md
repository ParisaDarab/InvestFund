# Operations, deployment and open questions

Status: **current for the MVP codebase.** No production environment has been created. Nothing
here has been deployed, and no paid service has been provisioned.

## 1. Runtime shape

| Process | What it runs | Needs |
|---|---|---|
| API (`apps/api`, `node dist/server.js`) | REST, SSE streams, email outbox dispatcher, offer-expiry sweep | PostgreSQL (direct or session-mode connection), persistent disk for documents (until S3), outbound SMTP and HTTPS to Google |
| Web (`apps/web`, `next start`) | Public pages (SSR) and the client app | `NEXT_PUBLIC_API_URL` at build time |
| PostgreSQL 16 | All data, rate-limit counters, LISTEN/NOTIFY | `citext` and `vector` extensions (the first migration creates them) |

The API must run on a host that keeps **long-lived HTTP responses** open (SSE): a container or VM
platform such as Render, Fly.io, Railway, ECS or a VPS. Serverless function platforms are
unsuitable for the API (ADR 0003). The web app can run anywhere Next.js runs. Several API
instances are supported: real time fans out through PostgreSQL, rate limits are
PostgreSQL-backed, and outbox and expiry jobs use `SKIP LOCKED`. Documents on local disk, however,
**require a single instance or shared storage** until the S3 adapter exists (§5).

## 2. Configuration

Every variable, with safe placeholders, is listed in `.env.example`. Production refuses to start
when any of the following is true:

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` or `IP_HASH_SECRET` is shorter than 32 characters or
  is a placeholder.
- `ENCRYPTION_KEY` is the development key.
- `WEB_URL` is missing.
- `RATE_LIMIT_STORE=memory`.
- `EMAIL_DELIVERY=smtp` is set without `SMTP_HOST`.

Required in production:

| Variable | Notes |
|---|---|
| `NODE_ENV=production` | Enables secure cookies and HSTS |
| `DATABASE_URL` | Direct or session-mode URL (LISTEN does not work through PgBouncer in transaction mode) |
| `WEB_URL` | Exact web origin, for example `https://app.example.org` |
| `NEXT_PUBLIC_API_URL` | API origin, for example `https://api.example.org` (web build time) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `IP_HASH_SECRET`, `ENCRYPTION_KEY` | Random secrets from a secret manager; never in client env |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | See §3 |
| `EMAIL_DELIVERY=smtp`, `SMTP_*` | See §4 |
| `TRUST_PROXY=1` | When behind exactly one reverse proxy or load balancer |
| `STORAGE_DIR` | Path on a persistent volume |

**Cookie domains.** The refresh cookie is set by the API origin with `SameSite=Lax`. Serve web and
API on the **same site** (for example `app.example.org` and `api.example.org`). If they sit on
unrelated domains, browsers treat the cookie as third-party and sign-in breaks.

## 3. Google sign-in setup

1. In Google Cloud console → APIs & Services → Credentials, create an OAuth client ID of type
   "Web application".
2. Set the authorised redirect URI to `https://<api origin>/api/v1/auth/google/callback`, exactly
   equal to `GOOGLE_REDIRECT_URI`.
3. On the OAuth consent screen, request only the `openid`, `email` and `profile` scopes. These are
   non-sensitive, so no restricted-scope verification is needed. Publish the app so that users
   outside the test list can sign in.
4. Put the client ID and secret in the API's secret store. Until they are set,
   `/auth/google/start` answers 503 with a clear message, and the API logs that sign-in is
   unconfigured.

For local development and E2E tests, run `infra/mocks/google` and point the three
`GOOGLE_*_BASE_URL` variables at it. The production code path still runs end to end.

## 4. Email

Any SMTP provider works (Postmark, Resend, Amazon SES, Brevo...). Set `EMAIL_DELIVERY=smtp` and
the `SMTP_*` variables, and set up SPF, DKIM and DMARC for the `SMTP_FROM` domain.

- Delivery is asynchronous through `email_outbox`. Retries back off exponentially. After 5
  attempts a row becomes `failed`, and the admin overview shows the count.
- With `EMAIL_DELIVERY=log` (the default), nothing is sent. Rows become `skipped` and the log says
  "email not delivered". **Email delivery through a real provider has not been verified in this
  repository.** Only the SMTP adapter's integration with the outbox has been tested, using an
  in-memory sender.

## 5. Document storage

Documents are written to `STORAGE_DIR` under random keys. They are never served statically, only
through the authorised download endpoint. In production, either:

- mount a persistent, backed-up volume and run a single API instance, or
- implement the `StorageProvider` adapter for an S3-compatible private bucket (a P1 item; no
  public access, server-side encryption, access through the API or short-lived signed URLs).

No malware scanning exists yet. Add a scanning hook before allowing broader file types.

## 6. Deployment procedure (safe for existing data)

1. Build: `pnpm install --frozen-lockfile && pnpm build` (with `NEXT_PUBLIC_API_URL` set).
2. Migrate: `pnpm --filter @investfund/api exec prisma migrate deploy`. This only applies new
   migrations and **never resets**. Never run `migrate dev` or `migrate reset` against shared
   databases.
3. Start the API (`node apps/api/dist/server.js`) and wait for `GET /health/ready` to return 200
   (it checks the database and storage). Then start the web app (`pnpm --filter @investfund/web
   start`).
4. Provision the first administrator with
   `pnpm --filter @investfund/api admin:grant -- --email ops@example.org`. The account is linked
   at that person's first Google sign-in.
5. Do **not** run `pnpm seed` in production. It refuses when `NODE_ENV=production`.

Rollback: redeploy the previous build. Migrations are additive. Any destructive migration needs
explicit human approval (CLAUDE.md §5).

## 7. Observability, health and limits

- Structured pino logs to stdout include a request ID (`X-Request-Id`). They never contain tokens,
  message text, document content or email addresses.
- `GET /health/live` and `GET /health/ready` are available. Prometheus metrics are served on the
  internal port 9464 (never expose it publicly).
- Error monitoring: there is no vendor SDK yet. The central error handler and the
  `uncaughtException` handler are the hook points for Sentry or OpenTelemetry.
- Rate limits: `auth` 10/min/IP for sign-in, `sensitive` 10/min/user, `upload` 20/min/user and
  `default` 120/min/user. There are also at most 25 pending connection requests per supporter,
  and at most 10 SSE streams per user.

## 8. Backups and recovery

- Turn on the managed PostgreSQL daily backups and point-in-time recovery, and test a restore
  into a staging database each quarter.
- Back up the document volume (or bucket versioning) on the same schedule. Document metadata
  without the file returns 404 on download, and the reverse is harmless orphan files.
- Secrets: keep `ENCRYPTION_KEY` versions (`ENCRYPTION_PREVIOUS_KEYS`) for as long as data
  encrypted with them exists.

## 9. Estimated monthly cost (small launch)

**Estimates only, gathered from third-party summaries of public pricing in October 2026. Verify
on each vendor's pricing page before committing. No services have been created.**

| Item | Example | Estimate (USD/month) |
|---|---|---|
| API container (always on, ~512 MB) | Render Starter web service | ~$7 |
| Web (Next.js) container | Render Starter web service | ~$7 |
| Managed PostgreSQL (small) | Render Postgres entry tier | ~$6–20 |
| Persistent disk for documents | Render disk (1–10 GB) | ~$1–3 |
| Transactional email (≤10k/month) | Postmark Basic | ~$15 |
| Domain and DNS | any registrar | ~$1–2 |
| **Total** | | **~$37–55** |

Scaling to more traffic mainly adds API instances (which needs S3-compatible storage first) and a
larger database. A free tier is not suitable for production data (expiring databases, sleeping
services).

## 10. Legal, privacy and compliance questions (need qualified review)

The codebase makes **no claim** of GDPR, UK GDPR or financial-regulation compliance. These
questions need advice before launch:

1. **Fundraising regulation.** Are grants and donations arranged between individuals, with
   milestones and conditions, outside financial-promotion and crowdfunding rules in each target
   market? Do donations to for-profit startups raise tax-relief or charity-law issues? The
   product deliberately avoids equity, payments and pooled funds.
2. **Privacy.** Lawful bases, the privacy notice and cookie notice (only essential cookies are
   used today: the refresh and OAuth-state cookies), retention periods for messages, audit events
   and documents, data subject access, erasure workflows (deletion currently needs anonymisation;
   history is `ON DELETE RESTRICT`), international transfers (Google, email provider, hosting
   region) and processor agreements.
3. **Terms.** Liability for user-reported outcomes, misrepresentation in listings, dispute
   handling, age requirements and acceptable use. The `/privacy` and `/terms` pages are
   placeholders that say so.
4. **Moderation duties.** Reporting and response timelines under online-safety rules in the
   launch jurisdictions.
5. **Identity.** No identity or business verification exists. Decide whether the launch markets
   or payment partners would require KYC.

## 11. Known limitations

- Documents are on local disk (single instance), and no malware scanning exists.
- Real Google sign-in, real SMTP delivery and the Docker sandbox stack have not been exercised in
  this environment. They are covered by the mock provider, an in-memory sender and configuration
  review only.
- Recommendations score at most the 500 most recently published startups per request
  (`docs/MATCHING.md`).
- There is no self-service data export or deletion, no fine-grained notification preferences
  (only an email on/off switch), and no notifications for every edge case (for example a startup
  being edited).
- The CSP still allows `'unsafe-inline'` (decision H5, P0). A nonce-based CSP is planned.
- The E2E suite runs against `next dev`. CI does not run it yet, because adding it needs
  approval for a CI change.
