/**
 * Unit of Work over Prisma interactive transactions. Services that must change several
 * aggregates atomically depend on the `UnitOfWork` interface and pass the transaction client to
 * repository methods; the work function commits on resolve and rolls back on throw.
 */
import type { Prisma, PrismaClient } from './prisma.js';

export type TransactionClient = Prisma.TransactionClient;

export interface TransactionOptions {
  readonly isolationLevel?: Prisma.TransactionIsolationLevel;
  /** Longest wait for a connection from the pool, in ms (Prisma default 2000). */
  readonly maxWait?: number;
  /** Longest time the transaction may run before it is rolled back, in ms (Prisma default 5000). */
  readonly timeout?: number;
}

export interface UnitOfWork {
  run<T>(work: (tx: TransactionClient) => Promise<T>, options?: TransactionOptions): Promise<T>;
}

export function createUnitOfWork(client: PrismaClient): UnitOfWork {
  return {
    run: (work, options) => client.$transaction(work, options),
  };
}
