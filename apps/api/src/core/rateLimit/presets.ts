/**
 * Rate-limit presets (docs/API.md §3). Fixed one-minute windows.
 *
 * `subject` decides what is counted:
 * - `ip`: always the client IP (`auth`: login, forgot password and resend run before sign-in).
 * - `user-or-ip`: the authenticated user (`req.user`, so mount the limiter after the auth guard)
 *   with `userLimit`; anonymous callers are counted per IP with `ipLimit`.
 *
 * Not covered yet (they need request-specific keys or byte accounting; added with the endpoints
 * that use them): `auth` 5/min per email (P1 login), `upload` 500 MB/hour per user (S1.5),
 * monthly AI quotas (R2).
 */
import type { RateLimitPreset } from '@investfund/shared';

export interface RateLimitPolicy {
  readonly windowMs: number;
  readonly subject: 'ip' | 'user-or-ip';
  /** Limit per authenticated user (`user-or-ip` only). */
  readonly userLimit: number;
  /** Limit per IP (anonymous callers, or every caller for `ip`). */
  readonly ipLimit: number;
}

const MINUTE = 60_000;

export const RATE_LIMIT_POLICIES: Readonly<Record<RateLimitPreset, RateLimitPolicy>> = {
  auth: { windowMs: MINUTE, subject: 'ip', userLimit: 10, ipLimit: 10 },
  upload: { windowMs: MINUTE, subject: 'user-or-ip', userLimit: 20, ipLimit: 20 },
  ai: { windowMs: MINUTE, subject: 'user-or-ip', userLimit: 10, ipLimit: 10 },
  sensitive: { windowMs: MINUTE, subject: 'user-or-ip', userLimit: 10, ipLimit: 10 },
  default: { windowMs: MINUTE, subject: 'user-or-ip', userLimit: 120, ipLimit: 60 },
};
