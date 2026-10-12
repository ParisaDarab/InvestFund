import { describe, expect, it } from 'vitest';

import { ApiProxyConfigError, buildApiProxyRewrites } from './api-proxy';

describe('buildApiProxyRewrites', () => {
  it.each([undefined, '', '   '])('adds no rewrite when the target is %j', (target) => {
    expect(buildApiProxyRewrites(target)).toEqual([]);
  });

  it('forwards /api/v1/* to the target origin', () => {
    expect(buildApiProxyRewrites('https://investfund-api.onrender.com/')).toEqual([
      {
        source: '/api/v1/:path*',
        destination: 'https://investfund-api.onrender.com/api/v1/:path*',
      },
    ]);
  });

  it('ignores any path on the target', () => {
    expect(buildApiProxyRewrites('https://api.example.com/api/v1')[0]?.destination).toBe(
      'https://api.example.com/api/v1/:path*',
    );
  });

  it.each(['not a url', 'ftp://example.com', '/api'])('rejects %j', (target) => {
    expect(() => buildApiProxyRewrites(target)).toThrow(ApiProxyConfigError);
  });
});
