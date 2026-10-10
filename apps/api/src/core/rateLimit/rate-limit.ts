/**
 * Rate-limit middleware: `rateLimiter.limit('auth')` and friends (presets in `presets.ts`).
 *
 * Every limited response carries `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
 * (seconds until the window resets) and `RateLimit-Policy` (`<limit>;w=<window seconds>`), from
 * the IETF RateLimit header fields draft. Over the limit, the request fails with 429
 * `rate-limited` and `Retry-After`.
 *
 * Keys are `HMAC(IP_HASH_SECRET, "ip:<addr>")` or `HMAC(..., "user:<id>")`: raw IP addresses and
 * user IDs are never stored. The client IP is `req.ip`, which honours `TRUST_PROXY`.
 *
 * Store failure policy: FAIL CLOSED. If the counter store cannot be reached the request fails
 * with 503 `dependency-unavailable` (the cause is logged, never returned). Failing open would
 * switch off brute-force protection on `auth` exactly when the database is struggling, and the
 * limited routes need the same database anyway, so failing closed costs no extra availability.
 */
import type { RateLimitPreset } from '@investfund/shared';

import { normaliseIp } from '../crypto/hashing.js';
import { DependencyUnavailableError, RateLimitError } from '../errors/domain-errors.js';

import { RATE_LIMIT_POLICIES, type RateLimitPolicy } from './presets.js';

import type { RateLimitStore } from './rate-limit-store.js';
import type { Request, RequestHandler } from 'express';

export interface RateLimiterOptions {
  readonly store: RateLimitStore;
  /**
   * Keyed hash (hex) of a namespaced subject: `ip:<normalised addr>` or `user:<id>`. With
   * `hmacHex(IP_HASH_SECRET, ·)` an IP key equals `hmacIp(ip)` (the `ip_hash` columns).
   */
  readonly hashSubject: (subject: string) => string;
  /** Overrides for tests. Defaults to `RATE_LIMIT_POLICIES`. */
  readonly policies?: Readonly<Record<RateLimitPreset, RateLimitPolicy>>;
  /** Milliseconds since the epoch, for `RateLimit-Reset`. Defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface RateLimiter {
  limit(preset: RateLimitPreset): RequestHandler;
}

function subjectOf(req: Request, policy: RateLimitPolicy): { subject: string; limit: number } {
  if (policy.subject === 'user-or-ip' && req.user !== undefined) {
    return { subject: `user:${req.user.id}`, limit: policy.userLimit };
  }
  // `req.ip` is undefined only when the socket is already closed.
  return { subject: `ip:${normaliseIp(req.ip ?? 'unknown')}`, limit: policy.ipLimit };
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const policies = options.policies ?? RATE_LIMIT_POLICIES;
  const now = options.now ?? Date.now;

  return {
    limit(preset) {
      const policy = policies[preset];
      const windowSeconds = Math.ceil(policy.windowMs / 1000);
      return async (req, res, next) => {
        const { subject, limit } = subjectOf(req, policy);
        let result;
        try {
          result = await options.store.hit({
            preset,
            keyHash: options.hashSubject(subject),
            windowMs: policy.windowMs,
          });
        } catch (cause) {
          throw new DependencyUnavailableError(undefined, { cause });
        }

        const resetSeconds = Math.max(0, Math.ceil((result.resetAt.getTime() - now()) / 1000));
        res.setHeader('RateLimit-Limit', String(limit));
        res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - result.count)));
        res.setHeader('RateLimit-Reset', String(resetSeconds));
        res.setHeader('RateLimit-Policy', `${String(limit)};w=${String(windowSeconds)}`);

        if (result.count > limit) {
          throw new RateLimitError(undefined, { retryAfterSeconds: Math.max(1, resetSeconds) });
        }
        next();
      };
    },
  };
}
