import { describe, expect, it } from 'vitest';

import { EnvValidationError, parsePublicEnv } from './env';

describe('parsePublicEnv', () => {
  it('returns the validated public env', () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_API_URL: 'http://localhost:4000' })).toEqual({
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
    });
  });

  it.each([
    ['missing', {}],
    ['empty', { NEXT_PUBLIC_API_URL: '  ' }],
  ])('fails naming NEXT_PUBLIC_API_URL when it is %s', (_label, source) => {
    expect(() => parsePublicEnv(source)).toThrow(EnvValidationError);
    expect(() => parsePublicEnv(source)).toThrow(/NEXT_PUBLIC_API_URL is required but missing/);
  });

  it.each(['not a url', 'ftp://example.com', '/api'])('rejects %j as an API URL', (value) => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_API_URL: value })).toThrow(
      /NEXT_PUBLIC_API_URL must be an absolute http\(s\) URL/,
    );
  });
});
