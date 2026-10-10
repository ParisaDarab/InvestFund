import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy, buildSecurityHeaders } from './security-headers';

const asMap = (headers: { key: string; value: string }[]) =>
  Object.fromEntries(headers.map((h) => [h.key, h.value]));

describe('buildSecurityHeaders', () => {
  it('includes the baseline security headers', () => {
    const headers = asMap(
      buildSecurityHeaders({ apiUrl: 'https://api.example.com', isDev: false }),
    );
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });

  it('allows the API origin in connect-src and nothing unsafe-eval in production', () => {
    const csp = buildContentSecurityPolicy({
      apiUrl: 'https://api.example.com/api/v1',
      isDev: false,
    });
    expect(csp).toContain("connect-src 'self' https://api.example.com;");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('ws:');
  });

  it('relaxes script-src and connect-src for the dev server only', () => {
    const csp = buildContentSecurityPolicy({ isDev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
  });
});
