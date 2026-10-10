/**
 * Counter store behind the rate limiter. Postgres in every deployed environment (shared by all
 * API processes) until Redis returns in R2; in-memory for unit tests and single-process use.
 */
export interface HitInput {
  readonly preset: string;
  /** HMAC hex of the namespaced subject. Never a raw IP address or user ID. */
  readonly keyHash: string;
  readonly windowMs: number;
}

export interface HitResult {
  /** Hits in the current window, including this one. */
  readonly count: number;
  /** When the current window ends and the counter resets. */
  readonly resetAt: Date;
}

export interface RateLimitStore {
  /** Atomically counts one hit in the subject's current fixed window. */
  hit(input: HitInput): Promise<HitResult>;
  /** Removes counters whose window has ended. Returns how many were removed. */
  deleteExpired(): Promise<number>;
}
