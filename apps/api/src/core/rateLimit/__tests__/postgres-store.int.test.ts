/** `PostgresRateLimitStore` against an isolated, migrated PostgreSQL database. */
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '@investfund/test-utils/db';

import { captureLogs } from '../../../__tests__/support.js';
import { hmacIp } from '../../crypto/hashing.js';
import { createPrismaClient, type PrismaClient } from '../../db/prisma.js';
import { createLogger } from '../../logger/logger.js';
import { PostgresRateLimitStore } from '../postgres-store.js';

const API_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const KEY = hmacIp('203.0.113.7', 'test-only-ip-secret');

describe('PostgresRateLimitStore', { timeout: 60_000 }, () => {
  let db: TestDatabase | undefined;
  let prisma: PrismaClient | undefined;
  const logger = createLogger({ level: 'silent' }, captureLogs().stream);

  const client = (): PrismaClient => {
    if (prisma === undefined) throw new Error('database not started');
    return prisma;
  };
  const store = (options: { cleanupEvery?: number; cleanupBatchSize?: number } = {}) =>
    new PostgresRateLimitStore({ client: client(), logger, ...options });

  beforeAll(async () => {
    db = await createTestDatabase({ prismaProjectDir: API_ROOT, prefix: 'api_ratelimit' });
    prisma = createPrismaClient({ url: db.url, logger });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  }, 60_000);

  beforeEach(async () => {
    await client().$executeRaw`DELETE FROM rate_limit_buckets`;
  });

  it('counts hits in a fixed window and returns the window end', async () => {
    const s = store();
    const first = await s.hit({ preset: 'auth', keyHash: KEY, windowMs: 60_000 });
    const second = await s.hit({ preset: 'auth', keyHash: KEY, windowMs: 60_000 });
    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(second.resetAt.getTime()).toBe(first.resetAt.getTime());
    const msLeft = first.resetAt.getTime() - Date.now();
    expect(msLeft).toBeGreaterThan(55_000);
    expect(msLeft).toBeLessThanOrEqual(61_000);
  });

  it('keeps presets and subjects apart', async () => {
    const s = store();
    await s.hit({ preset: 'auth', keyHash: KEY, windowMs: 60_000 });
    expect((await s.hit({ preset: 'default', keyHash: KEY, windowMs: 60_000 })).count).toBe(1);
    const other = hmacIp('203.0.113.8', 'test-only-ip-secret');
    expect((await s.hit({ preset: 'auth', keyHash: other, windowMs: 60_000 })).count).toBe(1);
  });

  it('is atomic under concurrency: no lost or duplicated increments', async () => {
    const s = store();
    const results = await Promise.all(
      Array.from({ length: 40 }, () => s.hit({ preset: 'auth', keyHash: KEY, windowMs: 60_000 })),
    );
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    const rows = await client().$queryRaw<{ hits: number }[]>`
      SELECT hits FROM rate_limit_buckets WHERE preset = 'auth'`;
    expect(rows).toEqual([{ hits: 40 }]);
  });

  it('restarts the counter in place once the window has ended', async () => {
    const s = store();
    await s.hit({ preset: 'auth', keyHash: KEY, windowMs: 200 });
    await s.hit({ preset: 'auth', keyHash: KEY, windowMs: 200 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const fresh = await s.hit({ preset: 'auth', keyHash: KEY, windowMs: 200 });
    expect(fresh.count).toBe(1);
    expect(fresh.resetAt.getTime()).toBeGreaterThan(Date.now() - 50);
    const rows = await client().$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM rate_limit_buckets`;
    expect(rows).toEqual([{ n: 1 }]);
  });

  it('stores only the keyed hash, never the IP address', async () => {
    await store().hit({ preset: 'auth', keyHash: KEY, windowMs: 60_000 });
    const rows = await client().$queryRaw<{ preset: string; key_hash: string }[]>`
      SELECT preset, key_hash FROM rate_limit_buckets`;
    expect(rows).toEqual([{ preset: 'auth', key_hash: KEY }]);
    expect(JSON.stringify(rows)).not.toContain('203.0.113.7');
  });

  it('deleteExpired removes ended windows only, in batches', async () => {
    const s = store({ cleanupBatchSize: 2 });
    for (const key of ['a', 'b', 'c']) {
      await s.hit({ preset: 'auth', keyHash: key.repeat(64), windowMs: 100 });
    }
    await s.hit({ preset: 'auth', keyHash: KEY, windowMs: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(await s.deleteExpired()).toBe(2);
    expect(await s.deleteExpired()).toBe(1);
    expect(await s.deleteExpired()).toBe(0);
    const rows = await client().$queryRaw<{ key_hash: string }[]>`
      SELECT key_hash FROM rate_limit_buckets`;
    expect(rows).toEqual([{ key_hash: KEY }]);
  });

  it('sweeps expired rows opportunistically every N hits', async () => {
    const s = store({ cleanupEvery: 2 });
    await s.hit({ preset: 'auth', keyHash: 'a'.repeat(64), windowMs: 100 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await s.hit({ preset: 'auth', keyHash: KEY, windowMs: 60_000 }); // second hit: sweep
    await s.idle();
    const rows = await client().$queryRaw<{ key_hash: string }[]>`
      SELECT key_hash FROM rate_limit_buckets`;
    expect(rows).toEqual([{ key_hash: KEY }]);
  });

  it('rejects when the database is unreachable (the middleware then fails closed)', async () => {
    const down = createPrismaClient({
      url: 'postgresql://investfund:unreachable@127.0.0.1:1/investfund?connect_timeout=1',
      logger,
    });
    try {
      const s = new PostgresRateLimitStore({ client: down, logger });
      await expect(s.hit({ preset: 'auth', keyHash: KEY, windowMs: 60_000 })).rejects.toThrow();
    } finally {
      await down.$disconnect();
    }
  });
});
