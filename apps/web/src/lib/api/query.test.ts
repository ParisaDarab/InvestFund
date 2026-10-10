import { describe, expect, it } from 'vitest';

import { ApiError } from './client';
import { healthKeys } from './health';
import { createQueryKeys, retryOnceOnNetworkError } from './query';

describe('createQueryKeys', () => {
  it('builds hierarchical keys under the domain', () => {
    const keys = createQueryKeys('startups');
    expect(keys.all).toEqual(['startups']);
    expect(keys.lists()).toEqual(['startups', 'list']);
    expect(keys.list({ stage: 'seed' })).toEqual(['startups', 'list', { stage: 'seed' }]);
    expect(keys.details()).toEqual(['startups', 'detail']);
    expect(keys.detail('id-1')).toEqual(['startups', 'detail', 'id-1']);
  });

  it('nests the health readiness key under the health domain', () => {
    expect(healthKeys.ready()).toEqual(['health', 'ready']);
    expect(healthKeys.ready().slice(0, 1)).toEqual(healthKeys.all);
  });
});

describe('retryOnceOnNetworkError', () => {
  const error = (kind: ApiError['kind']) =>
    new ApiError({ kind, method: 'GET', endpoint: '/x', message: 'x' });

  it('retries a network error once', () => {
    expect(retryOnceOnNetworkError(0, error('network'))).toBe(true);
    expect(retryOnceOnNetworkError(1, error('network'))).toBe(false);
  });

  it.each(['http', 'problem', 'contract'] as const)('never retries %s errors', (kind) => {
    expect(retryOnceOnNetworkError(0, error(kind))).toBe(false);
  });

  it('never retries unknown errors', () => {
    expect(retryOnceOnNetworkError(0, new TypeError('x'))).toBe(false);
  });
});
