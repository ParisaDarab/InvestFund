/**
 * Per-suite test databases (AC3) and the `init_extensions` migration (AC1), against the server
 * named by TEST_DATABASE_URL / DATABASE_URL (see packages/test-utils/src/db.ts).
 */
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '@investfund/test-utils/db';

import { captureLogs } from '../../../__tests__/support.js';
import { createLogger } from '../../logger/logger.js';
import { createPrismaClient, type PrismaClient } from '../prisma.js';

const API_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

interface Suite {
  readonly db: TestDatabase;
  readonly prisma: PrismaClient;
}

async function startSuite(): Promise<Suite> {
  const db = await createTestDatabase({ prismaProjectDir: API_ROOT, prefix: 'api_db01' });
  const logger = createLogger({ level: 'silent' }, captureLogs().stream);
  return { db, prisma: createPrismaClient({ url: db.url, logger }) };
}

async function stopSuite(suite: Suite | undefined): Promise<void> {
  if (suite === undefined) return;
  await suite.prisma.$disconnect();
  await suite.db.drop();
}

describe('test databases', { timeout: 60_000 }, () => {
  let a: Suite | undefined;
  let b: Suite | undefined;

  beforeAll(async () => {
    // Two suites set up concurrently, as parallel Vitest workers would.
    [a, b] = await Promise.all([startSuite(), startSuite()]);
  }, 120_000);

  afterAll(async () => {
    await Promise.all([stopSuite(a), stopSuite(b)]);
  }, 60_000);

  const suites = () => {
    if (a === undefined || b === undefined) throw new Error('suites not started');
    return { a, b };
  };

  it('gives each suite its own database', () => {
    const { a: first, b: second } = suites();
    expect(first.db.name).not.toBe(second.db.name);
    expect(first.db.url).not.toBe(second.db.url);
  });

  it('applies init_extensions: vector and citext exist (AC1)', async () => {
    for (const { prisma } of Object.values(suites())) {
      const extensions = await prisma.$queryRaw<{ extname: string }[]>`
        SELECT extname FROM pg_extension WHERE extname IN ('vector', 'citext') ORDER BY extname`;
      expect(extensions.map((row) => row.extname)).toEqual(['citext', 'vector']);
      const migrations = await prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
      expect(migrations.map((row) => row.migration_name)).toEqual([
        expect.stringMatching(/^\d{14}_init_extensions$/),
      ]);
    }
  });

  it('isolates data between suites running in parallel (AC3)', async () => {
    const { a: first, b: second } = suites();
    await Promise.all(
      [first, second].map(
        ({ prisma }) =>
          prisma.$executeRaw`CREATE TABLE isolation_probe (owner text NOT NULL, email citext)`,
      ),
    );
    await Promise.all([
      first.prisma.$executeRaw`INSERT INTO isolation_probe VALUES ('a', 'A@Example.com')`,
      second.prisma.$executeRaw`INSERT INTO isolation_probe VALUES ('b', 'B@Example.com')`,
    ]);

    const seenByA = await first.prisma.$queryRaw<{ owner: string }[]>`
      SELECT owner FROM isolation_probe`;
    const seenByB = await second.prisma.$queryRaw<{ owner: string }[]>`
      SELECT owner FROM isolation_probe WHERE email = 'b@example.com'`;
    expect(seenByA).toEqual([{ owner: 'a' }]);
    expect(seenByB).toEqual([{ owner: 'b' }]);
  });

  it('drops the database on teardown', async () => {
    const extra = await startSuite();
    await stopSuite(extra);
    const { a: first } = suites();
    const rows = await first.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM pg_database WHERE datname = ${extra.db.name}`;
    expect(rows[0]?.count).toBe(0n);
    await expect(extra.db.drop()).resolves.toBeUndefined();
  });
});
