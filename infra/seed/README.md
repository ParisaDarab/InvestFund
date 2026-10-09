# Seed data

`seed.ts` is the database seed entry point. It reuses the API's validated config (`DATABASE_URL`)
and Prisma client factory.

```bash
pnpm seed                                  # from the repository root
pnpm --filter @investfund/api db:migrate    # prisma migrate dev (runs the seed after a reset)
```

P0-DB-01 ships the skeleton only: it checks the database is reachable and exits. Seed steps must be
idempotent and use synthetic data only (never real personal data).
