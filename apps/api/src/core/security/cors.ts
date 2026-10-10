/**
 * CORS with an exact-origin allowlist (the web app's `WEB_URL` only), written in-house.
 *
 * - A request whose `Origin` is in the allowlist gets `Access-Control-Allow-Origin: <origin>`,
 *   `Access-Control-Allow-Credentials: true` (the refresh-token cookie) and the exposed headers.
 * - Any other origin gets no `Access-Control-*` headers at all, so the browser blocks the read.
 *   The request itself is still handled: CORS is not access control, the auth guards are.
 * - Preflights (`OPTIONS` with `Access-Control-Request-Method`) end here with `204`: allowed
 *   origins get the allowed methods/headers and a 10-minute max age; others get nothing.
 * - `Vary: Origin` is always set so caches never serve one origin's answer to another.
 */
import type { RequestHandler, Response } from 'express';

export interface CorsOptions {
  /** Exact origins (`scheme://host[:port]`). */
  readonly allowedOrigins: readonly string[];
}

export const CORS_ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Idempotency-Key',
  'X-Request-Id',
] as const;
export const CORS_EXPOSED_HEADERS = [
  'X-Request-Id',
  'Location',
  'Retry-After',
  'RateLimit-Limit',
  'RateLimit-Remaining',
  'RateLimit-Reset',
  'RateLimit-Policy',
] as const;
export const CORS_MAX_AGE_SECONDS = 600;

function addVary(res: Response, field: string): void {
  const current = res.getHeader('Vary');
  const values = typeof current === 'string' ? current.split(',').map((v) => v.trim()) : [];
  if (!values.some((value) => value.toLowerCase() === field.toLowerCase())) {
    res.setHeader('Vary', [...values.filter(Boolean), field].join(', '));
  }
}

export function createCors(options: CorsOptions): RequestHandler {
  const allowed = new Set(options.allowedOrigins);
  if ([...allowed].some((origin) => origin === '*' || origin === 'null')) {
    throw new Error('CORS origins must be explicit; wildcards and "null" are not allowed');
  }

  return (req, res, next) => {
    addVary(res, 'Origin');
    const origin = req.headers.origin;
    const isAllowed = origin !== undefined && allowed.has(origin);
    const isPreflight =
      req.method === 'OPTIONS' && req.headers['access-control-request-method'] !== undefined;

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      if (!isPreflight) {
        res.setHeader('Access-Control-Expose-Headers', CORS_EXPOSED_HEADERS.join(', '));
      }
    }

    if (!isPreflight) {
      next();
      return;
    }

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS.join(', '));
      res.setHeader('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS.join(', '));
      res.setHeader('Access-Control-Max-Age', String(CORS_MAX_AGE_SECONDS));
      addVary(res, 'Access-Control-Request-Headers');
    }
    res.setHeader('Content-Length', '0');
    res.status(204).end();
  };
}
