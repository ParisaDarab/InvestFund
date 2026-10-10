import { describe, expect, it } from 'vitest';

import { HealthLive, HealthReport } from '../api/system.js';

describe('HealthReport', () => {
  it('accepts a ready and a failing report', () => {
    expect(
      HealthReport.safeParse({
        status: 'ok',
        checks: [
          { name: 'db', status: 'ok' },
          { name: 'redis', status: 'ok' },
          { name: 'storage', status: 'ok' },
        ],
      }).success,
    ).toBe(true);
    expect(
      HealthReport.safeParse({ status: 'fail', checks: [{ name: 'db', status: 'fail' }] }).success,
    ).toBe(true);
  });

  it('strips internal details that a check might add', () => {
    expect(
      HealthReport.parse({
        status: 'fail',
        checks: [{ name: 'db', status: 'fail', error: 'connect ECONNREFUSED 10.0.0.5:5432' }],
      }),
    ).toEqual({ status: 'fail', checks: [{ name: 'db', status: 'fail' }] });
  });

  it.each([
    ['an unknown status', { status: 'degraded', checks: [] }],
    ['missing checks', { status: 'ok' }],
    ['an unnamed check', { status: 'ok', checks: [{ name: '', status: 'ok' }] }],
  ])('rejects %s', (_label, value) => {
    expect(HealthReport.safeParse(value).success).toBe(false);
  });
});

describe('HealthLive', () => {
  it('accepts only { status: "ok" }', () => {
    expect(HealthLive.safeParse({ status: 'ok' }).success).toBe(true);
    expect(HealthLive.safeParse({ status: 'fail' }).success).toBe(false);
  });
});
