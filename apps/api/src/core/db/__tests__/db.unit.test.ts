import { describe, expect, it, vi } from 'vitest';

import { createDbReadinessCheck, DB_CHECK_NAME } from '../db-readiness.js';
import { createUnitOfWork } from '../unit-of-work.js';

import type { PrismaClient } from '../prisma.js';

describe('createDbReadinessCheck', () => {
  it('is named db and resolves when SELECT 1 succeeds', async () => {
    const $queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const check = createDbReadinessCheck({ $queryRaw });
    expect(check.name).toBe(DB_CHECK_NAME);
    expect(DB_CHECK_NAME).toBe('db');
    await expect(check.run(new AbortController().signal)).resolves.toBeUndefined();
    const [strings] = $queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join('?')).toBe('SELECT 1');
  });

  it('rejects when the query fails', async () => {
    const $queryRaw = vi.fn().mockRejectedValue(new Error('connection refused'));
    const check = createDbReadinessCheck({ $queryRaw });
    await expect(check.run(new AbortController().signal)).rejects.toThrow('connection refused');
  });
});

describe('createUnitOfWork', () => {
  it('runs the work in an interactive transaction and passes the options through', async () => {
    const tx = { marker: 'tx' };
    const $transaction = vi.fn(async (work: (client: unknown) => Promise<unknown>) => work(tx));
    const uow = createUnitOfWork({ $transaction } as unknown as PrismaClient);

    const result = await uow.run((client) => Promise.resolve(client), { timeout: 1000 });

    expect(result).toBe(tx);
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 1000 });
  });
});
