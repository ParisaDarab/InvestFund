import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';

import nextConfig from '../next.config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('next.config', () => {
  it.each([PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER])(
    'fails %s naming NEXT_PUBLIC_API_URL when it is missing',
    (phase) => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', '');
      expect(() => nextConfig(phase)).toThrow(/NEXT_PUBLIC_API_URL/);
    },
  );

  it('serves the security headers on every route', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
    const config = nextConfig(PHASE_PRODUCTION_BUILD);
    const rules = await config.headers?.();
    const all = rules?.find((rule) => rule.source === '/:path*');
    const keys = all?.headers.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'Content-Security-Policy',
        'X-Content-Type-Options',
        'Referrer-Policy',
        'X-Frame-Options',
      ]),
    );
    expect(config.poweredByHeader).toBe(false);
  });
});
