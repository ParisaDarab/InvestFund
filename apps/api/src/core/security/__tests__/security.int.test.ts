/** Security headers (AC1) and the CORS allowlist (AC2) through the real app. */
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildTestApp, PRODUCTION_TEST_ENV } from '../../../__tests__/support.js';
import { CORS_MAX_AGE_SECONDS } from '../cors.js';

const WEB_ORIGIN = 'http://localhost:3000';

describe('security headers (AC1)', () => {
  it.each(['/health/live', '/api/v1/nope', '/api/v1/openapi.json'])(
    'are set on %s (success and error responses)',
    async (path) => {
      const { app } = buildTestApp();
      const res = await request(app).get(path);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['content-security-policy']).toBe(
        "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
      );
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
      expect(res.headers['x-powered-by']).toBeUndefined();
    },
  );

  it('omits Strict-Transport-Security locally', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/health/live');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('sends Strict-Transport-Security in production', async () => {
    const { app } = buildTestApp({ env: PRODUCTION_TEST_ENV });
    const res = await request(app).get('/health/live');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS allowlist (AC2)', () => {
  function preflight(origin: string) {
    const { app } = buildTestApp();
    return request(app)
      .options('/api/v1/openapi.json')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
  }

  it('allows WEB_URL with credentials on preflight', async () => {
    const res = await preflight(WEB_ORIGIN);
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
    expect(res.headers['access-control-allow-headers']).toContain('Idempotency-Key');
    expect(res.headers['access-control-max-age']).toBe(String(CORS_MAX_AGE_SECONDS));
    expect(res.headers.vary).toContain('Origin');
  });

  it.each([
    'https://evil.example',
    'http://localhost:3001',
    'https://localhost:3000',
    'http://localhost:3000.evil.example',
    'null',
  ])('returns no Access-Control-Allow-Origin for %s on preflight', async (origin) => {
    const res = await preflight(origin);
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.headers['access-control-allow-methods']).toBeUndefined();
    expect(res.headers.vary).toContain('Origin');
  });

  it('adds CORS headers to actual requests (including errors) from WEB_URL only', async () => {
    const { app } = buildTestApp();
    const allowed = await request(app).get('/api/v1/nope').set('Origin', WEB_ORIGIN);
    expect(allowed.status).toBe(404);
    expect(allowed.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(allowed.headers['access-control-expose-headers']).toContain('X-Request-Id');
    expect(allowed.headers['access-control-expose-headers']).toContain('Retry-After');

    const denied = await request(app).get('/health/live').set('Origin', 'https://evil.example');
    expect(denied.status).toBe(200);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('uses the configured WEB_URL origin', async () => {
    const { app } = buildTestApp({ env: { WEB_URL: 'https://app.investfund.test/dashboard' } });
    const res = await request(app)
      .options('/api/v1/anything')
      .set('Origin', 'https://app.investfund.test')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBe('https://app.investfund.test');
    const local = await request(app)
      .options('/api/v1/anything')
      .set('Origin', WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');
    expect(local.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('leaves non-preflight OPTIONS requests to the router', async () => {
    const { app } = buildTestApp();
    const res = await request(app).options('/api/v1/nope').set('Origin', WEB_ORIGIN);
    expect(res.status).toBe(404);
  });
});
