/** Prisma client logging and the Unit of Work against a real database (per-suite, AC3 helper). */
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '@investfund/test-utils/db';

import { captureLogs, type LogCapture } from '../../../__tests__/support.js';
import { createLogger } from '../../logger/logger.js';
import { createPrismaClient, type PrismaClient } from '../prisma.js';
import { createUnitOfWork } from '../unit-of-work.js';

const API_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const SECRET_VALUE = 'never-log-this-value-q7';

describe('core/db against PostgreSQL', { timeout: 60_000 }, () => {
  let db: TestDatabase | undefined;
  let prisma: PrismaClient | undefined;
  let logs: LogCapture;

  const client = (): PrismaClient => {
    if (prisma === undefined) throw new Error('database not started');
    return prisma;
  };

  beforeAll(async () => {
    db = await createTestDatabase({ prismaProjectDir: API_ROOT, prefix: 'api_db01' });
    logs = captureLogs();
    prisma = createPrismaClient({
      url: db.url,
      logger: createLogger({ level: 'debug' }, logs.stream),
    });
    await prisma.$executeRaw`CREATE TABLE uow_probe (id uuid PRIMARY KEY, label text NOT NULL)`;
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  }, 60_000);

  it('logs query text and duration at debug, never the bound parameters', async () => {
    const rows = await client().$queryRaw<
      { value: string }[]
    >`SELECT ${SECRET_VALUE}::text AS value`;
    expect(rows).toEqual([{ value: SECRET_VALUE }]);

    const line = logs.lines.find(
      (entry) => entry.msg === 'db query' && String(entry.query).includes('AS value'),
    );
    expect(line).toMatchObject({ component: 'db', level: 'debug' });
    expect(typeof line?.durationMs).toBe('number');
    expect(String(line?.query)).toContain('$1');
    expect(logs.text()).not.toContain(SECRET_VALUE);
  });

  it('does not log queries above debug level', async () => {
    const quiet = captureLogs();
    const info = createPrismaClient({
      url: db?.url ?? '',
      logger: createLogger({ level: 'info' }, quiet.stream),
    });
    try {
      await info.$queryRaw`SELECT 1`;
    } finally {
      await info.$disconnect();
    }
    expect(quiet.lines.filter((entry) => entry.msg === 'db query')).toEqual([]);
  });

  it('commits a unit of work that resolves', async () => {
    const uow = createUnitOfWork(client());
    await uow.run(async (tx) => {
      await tx.$executeRaw`INSERT INTO uow_probe VALUES (gen_random_uuid(), 'committed')`;
      await tx.$executeRaw`INSERT INTO uow_probe VALUES (gen_random_uuid(), 'committed')`;
    });
    const rows = await client().$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM uow_probe WHERE label = 'committed'`;
    expect(rows[0]?.count).toBe(2n);
  });

  it('rolls back a unit of work that throws', async () => {
    const uow = createUnitOfWork(client());
    await expect(
      uow.run(async (tx) => {
        await tx.$executeRaw`INSERT INTO uow_probe VALUES (gen_random_uuid(), 'rolled-back')`;
        throw new Error('business rule failed');
      }),
    ).rejects.toThrow('business rule failed');
    const rows = await client().$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM uow_probe WHERE label = 'rolled-back'`;
    expect(rows[0]?.count).toBe(0n);
  });
});
