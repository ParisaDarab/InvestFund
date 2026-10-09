import { describe, expect, it } from 'vitest';

import { createQueryClient } from './query-client';

describe('createQueryClient', () => {
  it('retries queries once, never retries mutations and ignores window focus', () => {
    const options = createQueryClient().getDefaultOptions();
    expect(options.queries?.retry).toBe(1);
    expect(options.queries?.refetchOnWindowFocus).toBe(false);
    expect(options.mutations?.retry).toBe(false);
  });

  it('creates an isolated client per call', () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });
});
