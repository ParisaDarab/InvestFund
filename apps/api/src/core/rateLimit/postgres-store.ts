/**
 * Postgres `RateLimitStore` on `rate_limit_buckets` (one row per preset and subject).
 *
 * `hit` is one atomic statement: `INSERT ... ON CONFLICT (preset, key_hash) DO UPDATE ...
 * RETURNING`. A new subject starts a window at 1; an existing row either increments, or, when
 * its window has ended, restarts at 1 with a new window. Row locking on the conflicting row
 * serialises concurrent hits, so no increment is lost. Time comes from the database (`now()`),
 * so every API process agrees on window boundaries.
 *
 * Cleanup: every `cleanupEvery` hits this process sweeps a batch of expired rows in the
 * background (`deleteExpired`, no scheduler needed). Rows that are never swept are harmless:
 * the next hit resets them in place.
 *
 * Only tagged-template `$queryRaw`/`$executeRaw` (parameterised) is used.
 */
import { newId } from '../ids/uuid-v7.js';

import type { HitInput, HitResult, RateLimitStore } from './rate-limit-store.js';
import type { PrismaClient } from '../db/prisma.js';
import type { Logger } from '../logger/logger.js';

export interface PostgresStoreOptions {
  readonly client: Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;
  readonly logger: Logger;
  /** Sweep expired rows after this many hits (per process). */
  readonly cleanupEvery?: number;
  /** Rows deleted per sweep, so a sweep never holds locks for long. */
  readonly cleanupBatchSize?: number;
}

interface HitRow {
  hits: number;
  window_ends_at: Date;
}

export class PostgresRateLimitStore implements RateLimitStore {
  private readonly cleanupEvery: number;
  private readonly cleanupBatchSize: number;
  private hitsSinceCleanup = 0;
  private cleanup: Promise<void> | undefined;

  constructor(private readonly options: PostgresStoreOptions) {
    this.cleanupEvery = options.cleanupEvery ?? 1000;
    this.cleanupBatchSize = options.cleanupBatchSize ?? 1000;
  }

  async hit(input: HitInput): Promise<HitResult> {
    const windowMs = Math.trunc(input.windowMs);
    const rows = await this.options.client.$queryRaw<HitRow[]>`
      INSERT INTO rate_limit_buckets AS b
        (id, preset, key_hash, hits, window_ends_at, created_at, updated_at)
      VALUES (
        ${newId()}::uuid, ${input.preset}, ${input.keyHash}, 1,
        now() + ${windowMs}::integer * interval '1 millisecond', now(), now()
      )
      ON CONFLICT (preset, key_hash) DO UPDATE SET
        hits = CASE WHEN b.window_ends_at <= now() THEN 1 ELSE b.hits + 1 END,
        window_ends_at = CASE
          WHEN b.window_ends_at <= now() THEN EXCLUDED.window_ends_at
          ELSE b.window_ends_at
        END,
        updated_at = now()
      RETURNING hits, window_ends_at`;
    const row = rows[0];
    if (row === undefined) throw new Error('rate-limit upsert returned no row');
    this.maybeCleanup();
    return { count: row.hits, resetAt: row.window_ends_at };
  }

  async deleteExpired(): Promise<number> {
    return this.options.client.$executeRaw`
      DELETE FROM rate_limit_buckets
      WHERE id IN (
        SELECT id FROM rate_limit_buckets
        WHERE window_ends_at <= now()
        LIMIT ${this.cleanupBatchSize}
      )`;
  }

  /** Resolves when no background sweep is running (tests and shutdown). */
  async idle(): Promise<void> {
    await this.cleanup;
  }

  private maybeCleanup(): void {
    if (++this.hitsSinceCleanup < this.cleanupEvery || this.cleanup !== undefined) return;
    this.hitsSinceCleanup = 0;
    this.cleanup = this.deleteExpired()
      .then(
        (removed) => {
          if (removed > 0) this.options.logger.debug({ removed }, 'rate-limit buckets swept');
        },
        (err: unknown) => {
          this.options.logger.warn({ err }, 'rate-limit cleanup failed');
        },
      )
      .finally(() => {
        this.cleanup = undefined;
      });
  }
}
