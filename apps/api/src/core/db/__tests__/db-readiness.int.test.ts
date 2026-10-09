/** `GET /health/ready` with the real `db` check registered by the container (AC2). */
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { HealthReport } from '@investfund/shared';

import { buildTestApp } from '../../../__tests__/support.js';

/** Nothing listens on port 1, so connecting fails fast with ECONNREFUSED. */
const UNREACHABLE_DATABASE_URL =
  'postgresql://investfund:unreachable-pw-k3@127.0.0.1:1/investfund?connect_timeout=1';

describe('GET /health/ready with the db check (AC2)', () => {
  it('returns 200 with db ok when the database is up', async () => {
    const { app, close } = buildTestApp();
    try {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(HealthReport.parse(res.body)).toEqual({
        status: 'ok',
        checks: [{ name: 'db', status: 'ok' }],
      });
    } finally {
      await close();
    }
  });

  it('returns 503 with db failing when the database is down, without leaking details', async () => {
    const { app, logs, close } = buildTestApp({ env: { DATABASE_URL: UNREACHABLE_DATABASE_URL } });
    try {
      const started = Date.now();
      const res = await request(app).get('/health/ready');
      expect(Date.now() - started).toBeLessThan(5000);
      expect(res.status).toBe(503);
      expect(HealthReport.parse(res.body)).toEqual({
        status: 'fail',
        checks: [{ name: 'db', status: 'fail' }],
      });
      expect(res.text).not.toMatch(/127\.0\.0\.1|unreachable-pw-k3|P1001/);
      expect(logs.text()).toContain('readiness check failed');
      expect(logs.text()).not.toContain('unreachable-pw-k3');
    } finally {
      await close();
    }
  });
});
