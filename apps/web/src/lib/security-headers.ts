export interface SecurityHeaderOptions {
  /** URL of the REST API (from NEXT_PUBLIC_API_URL); its origin is allowed in `connect-src`. */
  apiUrl?: string | undefined;
  /** Development mode needs `unsafe-eval` (React call stacks) and websocket HMR. */
  isDev: boolean;
}

export interface Header {
  key: string;
  value: string;
}

/**
 * Baseline Content Security Policy.
 *
 * `script-src 'unsafe-inline'` is still required because Next.js streams inline RSC payload
 * scripts and next-themes injects a blocking inline script to avoid a theme flash. Moving to a
 * nonce-based policy (set in `proxy.ts`) is a planned hardening step; it forces dynamic rendering.
 */
export function buildContentSecurityPolicy({ apiUrl, isDev }: SecurityHeaderOptions): string {
  const connectSrc = ["'self'"];
  if (apiUrl !== undefined) connectSrc.push(new URL(apiUrl).origin);
  if (isDev) connectSrc.push('ws:', 'wss:');

  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (isDev) scriptSrc.push("'unsafe-eval'");

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scriptSrc,
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': connectSrc,
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  return policy.join('; ');
}

export function buildSecurityHeaders(options: SecurityHeaderOptions): Header[] {
  return [
    { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(options) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}
