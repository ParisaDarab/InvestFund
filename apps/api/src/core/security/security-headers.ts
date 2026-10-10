/**
 * Hardened HTTP response headers (helmet). The API only serves JSON, so the Content Security
 * Policy denies everything: no scripts, styles, frames, forms or base URIs. Browsers never need
 * to render an API response.
 *
 * - `Strict-Transport-Security` (1 year, includeSubDomains) only when `hsts` is on (production);
 *   local HTTP development must not pin HSTS on `localhost`.
 * - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
 *   `Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy: same-origin`, `X-DNS-Prefetch-Control: off`,
 *   `X-Permitted-Cross-Domain-Policies: none`, `Origin-Agent-Cluster`, `X-XSS-Protection: 0`.
 * - `X-Powered-By` is disabled on the app itself (`app.disable('x-powered-by')`).
 */
import helmet from 'helmet';

import type { RequestHandler } from 'express';

export interface SecurityHeadersOptions {
  readonly hsts: boolean;
}

export const API_CONTENT_SECURITY_POLICY = {
  defaultSrc: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'none'"],
  frameAncestors: ["'none'"],
} as const;

export const HSTS_MAX_AGE_SECONDS = 31_536_000;

export function createSecurityHeaders(options: SecurityHeadersOptions): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: [...API_CONTENT_SECURITY_POLICY.defaultSrc],
        baseUri: [...API_CONTENT_SECURITY_POLICY.baseUri],
        formAction: [...API_CONTENT_SECURITY_POLICY.formAction],
        frameAncestors: [...API_CONTENT_SECURITY_POLICY.frameAncestors],
      },
    },
    strictTransportSecurity: options.hsts
      ? { maxAge: HSTS_MAX_AGE_SECONDS, includeSubDomains: true }
      : false,
    referrerPolicy: { policy: 'no-referrer' },
    xFrameOptions: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });
}
