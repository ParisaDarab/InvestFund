---
name: prisma-data-layer
description: Backend procedure for implementing the supervisor's data model in Prisma - schema changes, migrations, repositories for CRUD, transactions, pgvector queries, encryption of sensitive columns and seed data. Use whenever schema.prisma or a repository changes.
---

# Prisma data layer

## Schema changes

1. Implement exactly what `docs/DATABASE.md` specifies. If you find a modelling issue, report it to the supervisor.
2. Edit `apps/api/prisma/schema.prisma`, using `@@map` and `@map` for snake_case and `@db.Uuid` for IDs.
3. Run `pnpm --filter api prisma migrate dev --name <verb_noun>`.
4. Inspect the generated SQL. If it drops or alters existing data, mark it **destructive** and request Gate X approval.
5. Run `prisma generate` and update the seed (`infra/seed/`) if new required data exists.

## Repositories

- One repository interface per aggregate in `<domain>.types.ts`, and a Prisma implementation in `<domain>.repository.ts`.
- Return domain types, not Prisma types, to the services.
- Use `select` explicitly. Never return encrypted columns or hidden fields by default.
- Use cursor pagination: `take: limit + 1, cursor, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`.

## pgvector

Prisma lacks native vector support. Declare the column as `Unsupported("vector(1536)")` and query through `$queryRaw` with tagged templates (parameterised):

```ts
await prisma.$queryRaw<Row[]>`
  SELECT id, 1 - (embedding <=> ${vec}::vector) AS similarity
  FROM investor_embeddings ORDER BY embedding <=> ${vec}::vector LIMIT ${k}`;
```

Never interpolate strings into SQL. Never use `$queryRawUnsafe`.

## Sensitive data

Encrypt OAuth tokens, demo credentials and the LLM API key through `core/crypto` (AES-256-GCM, key from env, `keyVersion` stored) before writing. Decrypt only inside the integration that needs the value.

## Money

Store `BigInt` minor units plus a currency code, and convert at the API boundary to a string `amountMinor`.
