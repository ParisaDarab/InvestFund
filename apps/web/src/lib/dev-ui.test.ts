import { describe, expect, it } from 'vitest';

import { cn } from './cn';
import { isDevUiEnabled } from './dev-ui';

describe('isDevUiEnabled', () => {
  it('is on outside production', () => {
    expect(isDevUiEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isDevUiEnabled({ NODE_ENV: 'test' })).toBe(true);
  });

  it('is off in production unless INVESTFUND_DEV_UI=true', () => {
    expect(isDevUiEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isDevUiEnabled({ NODE_ENV: 'production', INVESTFUND_DEV_UI: '1' })).toBe(false);
    expect(isDevUiEnabled({ NODE_ENV: 'production', INVESTFUND_DEV_UI: 'true' })).toBe(true);
  });
});

describe('cn', () => {
  it('joins truthy class names in order', () => {
    const active = false as boolean;
    expect(cn('a', active && 'b', undefined, null, '', 'c')).toBe('a c');
  });
});
