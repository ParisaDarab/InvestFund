/**
 * In-memory `RateLimitStore` for unit tests and single-process development
 * (`RATE_LIMIT_STORE=memory`, refused in production). Same fixed-window semantics as the
 * Postgres store. Expired entries are swept opportunistically every `sweepEvery` hits.
 */
import type { HitInput, HitResult, RateLimitStore } from './rate-limit-store.js';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface MemoryStoreOptions {
  /** Milliseconds since the epoch. Defaults to `Date.now` (tests inject a fake clock). */
  readonly now?: () => number;
  readonly sweepEvery?: number;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;
  private readonly sweepEvery: number;
  private hitsSinceSweep = 0;

  constructor(options: MemoryStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sweepEvery = options.sweepEvery ?? 1000;
  }

  get size(): number {
    return this.buckets.size;
  }

  hit(input: HitInput): Promise<HitResult> {
    const now = this.now();
    if (++this.hitsSinceSweep >= this.sweepEvery) {
      this.hitsSinceSweep = 0;
      this.sweep(now);
    }
    const id = `${input.preset}\u0000${input.keyHash}`;
    let bucket = this.buckets.get(id);
    if (bucket === undefined || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + input.windowMs };
      this.buckets.set(id, bucket);
    }
    bucket.count += 1;
    return Promise.resolve({ count: bucket.count, resetAt: new Date(bucket.resetAt) });
  }

  deleteExpired(): Promise<number> {
    return Promise.resolve(this.sweep(this.now()));
  }

  private sweep(now: number): number {
    let removed = 0;
    for (const [id, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}
