/**
 * P0-API-02 through the real container with the Postgres rate-limit store (a migrated, isolated
 * test database): the `auth` preset (AC3), OpenAPI exposure in production (AC10) and the
 * OPENAPI_PUBLIC start-up warning (AC11).
 */
import { fileURLToPath } from 'node:url';

import { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ProblemDetails, problemTypeUri } from '@investfund/shared';
import { createTestDatabase, type TestDatabase } from '@investfund/test-utils/db';

import { buildTestApp, PRODUCTION_TEST_ENV, signTestToken } from './support.js';

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('core security with the Postgres rate-limit store', { timeout: 60_000 }, () => {
  let db: TestDatabase | undefined;

  const databaseUrl = (): string => {
    if (db === undefined) throw new Error('database not started');
    return db.url;
  };

  beforeAll(async () => {
    db = await createTestDatabase({ prismaProjectDir: API_ROOT, prefix: 'api_security' });
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  }, 60_000);

  describe('auth preset (AC3)', () => {
    it('returns 429 problem+json with Retry-After on the 11th request in a minute', async () => {
      const { app, close } = buildTestApp({
        env: { RATE_LIMIT_STORE: 'postgres', DATABASE_URL: databaseUrl() },
        modules: ({ rateLimiter }) => {
          const router = Router();
          router.post('/login', rateLimiter.limit('auth'), (_req, res) => {
            res.json({ ok: true });
          });
          return [{ path: '/auth-probe', router }];
        },
      });
      try {
        for (let i = 1; i <= 10; i += 1) {
          const res = await request(app).post('/api/v1/auth-probe/login');
          expect(res.status).toBe(200);
          expect(res.headers['ratelimit-remaining']).toBe(String(10 - i));
        }
        const res = await request(app).post('/api/v1/auth-probe/login');
        expect(res.status).toBe(429);
        expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
        expect(ProblemDetails.parse(res.body)).toMatchObject({
          type: problemTypeUri('rate-limited'),
          status: 429,
        });
        expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      } finally {
        await close();
      }
    });
  });

  describe('GET /api/v1/openapi.json in production', () => {
    it('is behind requireRole("admin") when OPENAPI_PUBLIC is unset or false (AC10)', async () => {
      for (const flag of [undefined, 'false']) {
        const env: Record<string, string> = { ...PRODUCTION_TEST_ENV, DATABASE_URL: databaseUrl() };
        if (flag !== undefined) env.OPENAPI_PUBLIC = flag;
        const { app, close } = buildTestApp({ env });
        try {
          const secret = PRODUCTION_TEST_ENV.JWT_ACCESS_SECRET;
          const anonymous = await request(app).get('/api/v1/openapi.json');
          expect(anonymous.status).toBe(401);
          expect(ProblemDetails.parse(anonymous.body).type).toBe(problemTypeUri('unauthenticated'));

          const expired = await signTestToken({ role: 'admin', secret, expiresIn: -60 });
          expect(
            (
              await request(app)
                .get('/api/v1/openapi.json')
                .set('Authorization', `Bearer ${expired}`)
            ).status,
          ).toBe(401);

          const founder = await signTestToken({ role: 'founder', secret });
          const forbidden = await request(app)
            .get('/api/v1/openapi.json')
            .set('Authorization', `Bearer ${founder}`);
          expect(forbidden.status).toBe(403);
          expect(ProblemDetails.parse(forbidden.body).type).toBe(problemTypeUri('forbidden'));

          const admin = await signTestToken({ role: 'admin', secret });
          const ok = await request(app)
            .get('/api/v1/openapi.json')
            .set('Authorization', `Bearer ${admin}`);
          expect(ok.status).toBe(200);
          expect((ok.body as { openapi?: unknown }).openapi).toBe('3.1.0');
          expect(ok.headers['ratelimit-limit']).toBe('120');
        } finally {
          await close();
        }
      }
    });

    it('is public with OPENAPI_PUBLIC=true and logs exactly one warn line naming the flag (AC11)', async () => {
      const { app, logs, close } = buildTestApp({
        env: { ...PRODUCTION_TEST_ENV, OPENAPI_PUBLIC: 'true', DATABASE_URL: databaseUrl() },
      });
      try {
        const warnings = logs.lines.filter((line) => line.level === 'warn');
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatchObject({ flag: 'OPENAPI_PUBLIC' });
        expect(String(warnings[0]?.msg)).toContain('OPENAPI_PUBLIC');
        // No values: neither secrets nor the database URL.
        const text = logs.text();
        for (const value of [
          PRODUCTION_TEST_ENV.JWT_ACCESS_SECRET,
          PRODUCTION_TEST_ENV.IP_HASH_SECRET,
          databaseUrl(),
        ]) {
          expect(text).not.toContain(value);
        }

        const res = await request(app).get('/api/v1/openapi.json');
        expect(res.status).toBe(200);
        expect((res.body as { openapi?: unknown }).openapi).toBe('3.1.0');
        expect(res.headers['ratelimit-limit']).toBe('60');
        expect(logs.lines.filter((line) => line.level === 'warn')).toHaveLength(1);
      } finally {
        await close();
      }
    });

    it('logs no warning when OPENAPI_PUBLIC is not set in production, or outside production', () => {
      for (const env of [
        { ...PRODUCTION_TEST_ENV, DATABASE_URL: databaseUrl() },
        { OPENAPI_PUBLIC: 'true' },
      ]) {
        const { logs } = buildTestApp({ env });
        expect(logs.lines.filter((line) => line.level === 'warn')).toHaveLength(0);
      }
    });
  });
});
