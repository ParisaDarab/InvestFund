# Free deployment: Vercel + Render + Neon

A demo deployment on free tiers. It is **not** production grade; see "Limits" at the end.

| Part | Service | Source |
|---|---|---|
| Web (`apps/web`) | Vercel Hobby | GitHub repo, root directory `apps/web` |
| API (`apps/api`) | Render Free web service | GitHub repo, `apps/api/Dockerfile` |
| PostgreSQL 16 | Neon Free | `vector` and `citext` extensions (created by the first migration) |

The web app and the API live on different sites (`*.vercel.app`, `*.onrender.com`), and the
refresh cookie is `SameSite=Lax`, so the browser must only ever talk to the web app. Vercel
forwards `/api/v1/*` to Render (`API_PROXY_TARGET`, see `apps/web/src/lib/api-proxy.ts`), and
`NEXT_PUBLIC_API_URL` is the web app's own URL.

Below, `WEB` is your Vercel production URL (for example `https://investfund.vercel.app`; check
Vercel → Project → Domains) and `API` is your Render URL (for example
`https://investfund-api.onrender.com`).

## 1. Neon (database)

1. Create a project: PostgreSQL 16, the region closest to your Render region.
2. Dashboard → **Connect**: turn **Connection pooling off** and copy the connection string. The
   API needs a direct connection (no `-pooler` in the host) for `LISTEN/NOTIFY`. Keep
   `?sslmode=require` at the end.
3. Create the tables from your computer, in the repository root:

   ```bash
   DATABASE_URL="<neon connection string>" pnpm --filter @investfund/api exec prisma migrate deploy
   ```

   Do not run `pnpm seed` against it: the seed is local demo data.

## 2. Secrets

Run this four times and keep the outputs for step 4 (each is 32 random bytes in base64):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 3. Google sign-in

Google Cloud console → APIs & Services:

1. **OAuth consent screen**: External. While it is in "Testing", add the Google accounts that may
   sign in as test users.
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorised JavaScript origins: `WEB`
   - Authorised redirect URIs: `WEB/api/v1/auth/google/callback`
3. Copy the client ID and client secret.

## 4. Render (API)

New → **Web Service** → connect `ParisaDarab/InvestFund`:

| Setting | Value |
|---|---|
| Language | Docker |
| Branch | `main` |
| Root directory | empty (repository root) |
| Dockerfile path | `apps/api/Dockerfile` |
| Instance type | Free |
| Health check path | `/health/ready` |

Environment variables:

| Key | Value |
|---|---|
| `PORT` | `4000` |
| `DATABASE_URL` | the Neon connection string |
| `WEB_URL` | `WEB` |
| `JWT_ACCESS_SECRET` | secret 1 |
| `JWT_REFRESH_SECRET` | secret 2 |
| `IP_HASH_SECRET` | secret 3 |
| `ENCRYPTION_KEY` | secret 4 |
| `GOOGLE_CLIENT_ID` | from step 3 |
| `GOOGLE_CLIENT_SECRET` | from step 3 |
| `GOOGLE_REDIRECT_URI` | `WEB/api/v1/auth/google/callback` |
| `TRUST_PROXY` | `2` (Vercel, then Render's load balancer) |
| `EMAIL_DELIVERY` | `log` (or `smtp` plus the `SMTP_*` variables) |
| `METRICS_ENABLED` | `false` |

The API refuses to start in production when a secret is weak or `WEB_URL` is missing; the log
names the variable. Check `API/health/ready` once it is live.

## 5. Vercel (web)

Project settings:

| Setting | Value |
|---|---|
| Root directory | `apps/web` |
| Framework preset | Next.js |
| Build / output / install | defaults (`pnpm install`, `next build`, `.next`) |

Environment variables (Production and Preview):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `WEB` |
| `API_PROXY_TARGET` | `API` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` |

`NEXT_PUBLIC_*` values are baked in at build time: **redeploy** after changing them.
Leave `NEXT_PUBLIC_AUTH_DEV_HINTS` unset.

## 6. First administrator

Sign in once on `WEB` with your Google account, then from your computer:

```bash
DATABASE_URL="<neon connection string>" pnpm --filter @investfund/api admin:grant -- --email you@gmail.com
```

## Limits

- Render Free sleeps after about 15 idle minutes; the first request then takes about a minute.
  While it sleeps, the email outbox and offer-expiry jobs do not run.
- Render Free has no persistent disk: **uploaded documents are lost** on every restart or deploy.
- Preview deployments have other URLs, which `WEB_URL` (CORS) and Google do not accept; test on
  the production URL.
- With `TRUST_PROXY=2`, rate limits use the client IP that Vercel forwards. A client calling the
  Render URL directly can choose its own IP for rate limiting.
- With `EMAIL_DELIVERY=log`, no email is sent.
